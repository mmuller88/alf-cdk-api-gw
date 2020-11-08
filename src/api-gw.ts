// import { Role, ServicePrincipal, PolicyStatement } from '@aws-cdk/aws-iam';
import { StackProps, Construct, CfnOutput, Tags } from "@aws-cdk/core";
import { CustomStack } from "alf-cdk-app-pipeline/custom-stack";
import {
  RestApi,
  AuthorizationType,
  CfnGatewayResponse,
  ResponseType,
  Cors,
  JsonSchemaType,
  JsonSchema,
  Model,
  LambdaIntegration,
  RequestValidator,
  EndpointType,
  SecurityPolicy,
  CfnAuthorizer,
  CfnMethod,
  Method,
} from "@aws-cdk/aws-apigateway";
import { Certificate } from "@aws-cdk/aws-certificatemanager";
import { ARecord, HostedZone, RecordTarget } from "@aws-cdk/aws-route53";
import { ApiGatewayDomain } from "@aws-cdk/aws-route53-targets";
import { Function } from "@aws-cdk/aws-lambda";
import { UserPool } from "@aws-cdk/aws-cognito";
import * as iam from "@aws-cdk/aws-iam";

export interface ApiGwStackProps extends StackProps {
  stage: string;
  allowedOrigins: string[];
  domain?: {
    domainName: string;
    certificateArn: string;
    zoneName: string;
    hostedZoneId: string;
  };
  auth?: {
    mockAuth?: {
      mockLambdaArn: string;
    };
    userPoolArn?: string;
  };
}

export class ApiGwStack extends CustomStack {
  constructor(scope: Construct, id: string, props: ApiGwStackProps) {
    super(scope, id, props);

    const api = new RestApi(this, "RestApi", {
      restApiName: "Alf Instance Service",
      policy: new iam.PolicyDocument({
        statements: [
          new iam.PolicyStatement({
            principals: [new iam.ServicePrincipal("apigateway.amazonaws.com")],
            resources: [
              `arn:aws:lambda:${this.region}:${this.account}:function:*/invocations`,
            ],
            actions: ["lambda:invoke"],
          }),
        ],
      }),
    });

    new CfnGatewayResponse(this, "get400Response", {
      responseType: ResponseType.BAD_REQUEST_BODY.responseType,
      // MISSING_AUTHENTICATION_TOKEN
      restApiId: api.restApiId,
      // responseTemplates: {
      //   'application/json': '{"message":$context.error.messageString,"validationErrors":"$context.error.validationErrorString"}'
      // },
      responseParameters: {
        "gatewayresponse.header.Access-Control-Allow-Methods": "'*'",
        "gatewayresponse.header.Access-Control-Allow-Origin": "'*'",
        "gatewayresponse.header.Access-Control-Allow-Headers": "'*'",
        "gatewayresponse.header.Access-Control-Exposed-Headers":
          "'ETag','x-amz-meta-custom-header','Authorization','Content-Type','Accept'",
      },
    });

    new CfnGatewayResponse(this, "get4xxResponse", {
      responseType: ResponseType.DEFAULT_4XX.responseType,
      // MISSING_AUTHENTICATION_TOKEN
      restApiId: api.restApiId,
      responseParameters: {
        "gatewayresponse.header.Access-Control-Allow-Methods": "'*'",
        "gatewayresponse.header.Access-Control-Allow-Origin": "'*'",
        "gatewayresponse.header.Access-Control-Allow-Headers": "'*'",
        "gatewayresponse.header.Access-Control-Exposed-Headers":
          "'ETag','x-amz-meta-custom-header','Authorization','Content-Type','Accept'",
      },
    });

    new CfnGatewayResponse(this, "get500Response", {
      responseType: ResponseType.DEFAULT_5XX.responseType,
      // MISSING_AUTHENTICATION_TOKEN
      restApiId: api.restApiId,
      responseTemplates: {
        "application/json":
          '{"message":$context.error.messageString,"errorObject":"$context.error"}',
      },
      responseParameters: {
        "gatewayresponse.header.Access-Control-Allow-Methods": "'*'",
        "gatewayresponse.header.Access-Control-Allow-Origin": "'*'",
        "gatewayresponse.header.Access-Control-Allow-Headers": "'*'",
        "gatewayresponse.header.Access-Control-Exposed-Headers":
          "'ETag','x-amz-meta-custom-header','Authorization','Content-Type','Accept'",
      },
    });

    const alfInstanceId = {
      maxLength: 5,
      minLength: 5,
      pattern: "[a-z0-9]{5,5}",
      type: JsonSchemaType.STRING,
      additionalProperties: false,
      description:
        "User Instance Identifier created with node uuid. Consists of 5 characters!",
    };

    const instanceSchema: JsonSchema = {
      required: ["adminCredentials", "alfInstanceId", "status"],
      type: JsonSchemaType.OBJECT,
      properties: {
        alfInstanceId,
        status: {
          type: JsonSchemaType.STRING,
          description:
            "Shows the current state. Even if your instance is in the running state it might take some minutes until the provided url is reachable.",
          enum: ["running", "terminated", "stopped", "pending", "stopping"],
          // default: "running",
        },
        adminCredentials: {
          required: ["password", "userName"],
          type: JsonSchemaType.OBJECT,
          properties: {
            userName: {
              type: JsonSchemaType.STRING,
            },
            password: {
              type: JsonSchemaType.STRING,
            },
          },
          additionalProperties: false,
        },
        url: {
          type: JsonSchemaType.STRING,
          description:
            "The Url to access ACA. Currently only http is supported. Urls are ACA = ../ Share = ../share Alfresco = ../alfresco . It takes up to 3 minutes until this url becomes available. In future I plan to implement a healthcheck (probably leveraging AWS AutoScaling) to make the readiness of ACS more feaseble.\n\nThe propagation of the DNS Record normally takes a bit longer. Alternatively you can use the awsUrl to access your instance.",
        },
        awsUrl: {
          type: JsonSchemaType.STRING,
          description: "Alternative url for the Alfresco instance.",
        },
      },
      additionalProperties: false,
    };

    const instanceListSchema: JsonSchema = {
      type: JsonSchemaType.ARRAY,
      items: instanceSchema,
    };

    const expectedStatus = {
      type: JsonSchemaType.STRING,
      description:
        "The state you are allow to put your instance in. Warning putting instances into terminated will delete the instance-conf and instance!",
      enum: ["running", "terminated", "stopped"],
      // default: "running"
    };

    const userId = {
      maxLength: 64,
      minLength: 2,
      pattern: "[a-zA-Z0-9]{2,64}",
      type: JsonSchemaType.STRING,
      additionalProperties: false,
      description:
        "Simple user name. Please use your user name from the system.",
    };

    const alfType = {
      required: ["ec2InstanceType", "gitRepo"],
      type: JsonSchemaType.OBJECT,
      properties: {
        ec2InstanceType: {
          type: JsonSchemaType.STRING,
          description:
            "Supported Ec2 Instance Type. Supported are:\nt2.large - 2 CPU, 8 GB RAM\nt2.xlarge - 4 CPU, 16 GB RAM\n",
          enum: ["t2.large", "t2.xlarge"],
          // default: "t2.large"
        },
        gitRepo: {
          type: JsonSchemaType.STRING,
          description:
            "Name of supported Alfresco Docker Compose Deployment deployed with the Alfresco installer.\nalf-ec-1 : ACS 6.2 Community, ACA\n",
          enum: ["alf-ec2-1"],
          // default: "alf-ec2-1"
        },
      },
      additionalProperties: false,
    };

    const tags = {
      type: JsonSchemaType.OBJECT,
      properties: {
        name: {
          type: JsonSchemaType.STRING,
          description:
            "A Name which will be attached as Name Tag to the EC2 Instance",
          // default: "No Name",
        },
      },
    };

    const instanceConfSchema: JsonSchema = {
      additionalProperties: false,
      allOf: [
        {
          required: ["userId"],
          type: JsonSchemaType.OBJECT,
          properties: {
            alfType,
            tags,
            userId,
          },
          additionalProperties: false,
        },
        {
          required: ["alfInstanceId", "expectedStatus"],
          properties: {
            alfInstanceId,
            expectedStatus,
          },
        },
      ],
    };

    const newInstanceConfSchema: JsonSchema = {
      required: ["userId"],
      type: JsonSchemaType.OBJECT,
      properties: {
        alfType,
        tags,
        userId,
      },
      additionalProperties: false,
    };

    const putInstanceConfSchema: JsonSchema = {
      required: ["userId"],
      type: JsonSchemaType.OBJECT,
      properties: {
        expectedStatus,
        userId,
      },
      additionalProperties: false,
    };

    const instanceConfListModel = api.addModel("InstanceConfList", {
      modelName: "InstanceConfList",
      schema: {
        type: JsonSchemaType.ARRAY,
        items: instanceConfSchema,
      },
    });

    const instanceConfModel = api.addModel("InstanceConf", {
      modelName: "InstanceConf",
      schema: instanceConfSchema,
    });

    // const instanceList: Model =
    const instanceListModel = api.addModel("InstanceList", {
      modelName: "InstanceList",
      schema: instanceListSchema,
      // schema: {
      //   type: JsonSchemaType.ARRAY,
      //   additionalProperties: false,
      //   items : [instanceSchema]
      // }
    });

    const instanceModel = api.addModel("Instance", {
      modelName: "Instance",
      schema: instanceSchema,
    });

    const newInstanceConfModel = api.addModel("NewInstanceConf", {
      modelName: "NewInstanceConf",
      schema: newInstanceConfSchema,
    });

    const putInstanceConfModel = api.addModel("PutInstanceConf", {
      modelName: "PutInstanceConf",
      schema: putInstanceConfSchema,
    });

    // Error Model
    const errorSchema = {
      required: ["message"],
      properties: {
        message: {
          type: JsonSchemaType.STRING,
        },
      },
    };

    // const errorModel = api.addModel('Error', {
    //   modelName: 'Error',
    //   schema: errorSchema,
    // });
    // errorModel;

    const authErrorModel = api.addModel("AuthError", {
      modelName: "AuthError",
      schema: errorSchema,
    });

    const notFoundErrorModel = api.addModel("NotFoundError", {
      modelName: "NotFoundError",
      schema: errorSchema,
    });

    const validationErrorModel = api.addModel("ValidationError", {
      modelName: "ValidationError",
      schema: {
        required: ["message", "validationErrors"],
        properties: {
          message: {
            type: JsonSchemaType.STRING,
          },
          validationErrors: {
            type: JsonSchemaType.STRING,
          },
        },
      },
    });

    const updateErrorModel = api.addModel("UpdateError", {
      modelName: "UpdateError",
      schema: {
        required: ["message", "instanceConf"],
        properties: {
          message: {
            type: JsonSchemaType.STRING,
          },
          instanceConf: instanceConfSchema,
        },
      },
    });

    const authErrorResponse = {
      statusCode: "401",
      responseModels: {
        "application/json": authErrorModel,
      },
    };

    const validationErrorResponse = {
      statusCode: "400",
      responseModels: {
        "application/json": validationErrorModel,
      },
    };

    const updateErrorResponse = {
      statusCode: "403",
      responseModels: {
        "application/json": updateErrorModel,
      },
    };

    const notFoundErrorResponse = {
      statusCode: "404",
      responseModels: {
        "application/json": notFoundErrorModel,
      },
    };

    const instancesResource = api.root.addResource("instances", {
      defaultCorsPreflightOptions: {
        allowOrigins: props.allowedOrigins,
        allowMethods: Cors.ALL_METHODS,
      },
    });

    const requestValidator = new RequestValidator(this, "RequestValidator", {
      requestValidatorName: "validator",
      restApi: api,
      validateRequestBody: true,
      validateRequestParameters: true,
    });

    const getInstanceApiIntegration = new LambdaIntegration(
      Function.fromFunctionArn(
        this,
        "getInstancesApi",
        `arn:aws:lambda:${this.region}:${this.account}:function:getInstancesApi`
      )
    );
    const instancesResourceGet = instancesResource.addMethod(
      "GET",
      getInstanceApiIntegration,
      {
        operationName: "GetInstances",
        // authorizationScopes: ['aws.cognito.signin.user.admin'],
        requestValidator,
        requestParameters: {
          "method.request.querystring.userId": false,
        },
        methodResponses: [
          response200WithResponseModel(instanceListModel),
          authErrorResponse,
        ],
      }
    );

    const instanceResource = instancesResource.addResource("{alfInstanceId}");
    const instanceResourceGet = instanceResource.addMethod(
      "GET",
      getInstanceApiIntegration,
      {
        operationName: "GetInstance",
        // authorizationScopes: ['aws.cognito.signin.user.admin'],
        requestValidator,
        requestParameters: {
          "method.request.path.alfInstanceId": true,
        },
        methodResponses: [
          //   {
          //   statusCode: '200',
          //   responseModels: {
          //     'application/json': instanceModel,
          //   },
          // },
          response200WithResponseModel(instanceModel),
          validationErrorResponse,
          authErrorResponse,
          notFoundErrorResponse,
        ],
      }
    );

    const instancesConfResource = api.root.addResource("instances-conf", {
      defaultCorsPreflightOptions: {
        allowOrigins: props.allowedOrigins,
        allowMethods: Cors.ALL_METHODS,
      },
    });

    const getAllConfApiIntegration = new LambdaIntegration(
      Function.fromFunctionArn(
        this,
        "getAllConfApi",
        `arn:aws:lambda:${this.region}:${this.account}:function:getAllConfApi`
      )
    );
    const instancesConfResourceGet = instancesConfResource.addMethod(
      "GET",
      getAllConfApiIntegration,
      {
        operationName: "GetInstancesConf",
        // authorizationScopes: ['aws.cognito.signin.user.admin'],
        requestValidator,
        requestParameters: {
          "method.request.querystring.userId": false,
        },
        methodResponses: [
          response200WithResponseModel(instanceConfListModel),
          authErrorResponse,
        ],
      }
    );

    Tags.of(instancesConfResourceGet).add("tags", "instances-conf");

    const response201WithResponse = {
      statusCode: "201",
      responseModels: {
        "application/json": instanceConfModel,
      },
    };

    const createConfApiIntegration = new LambdaIntegration(
      Function.fromFunctionArn(
        this,
        "createConfApi",
        `arn:aws:lambda:${this.region}:${this.account}:function:createConfApi`
      )
    );
    const instancesConfResourcePost = instancesConfResource.addMethod(
      "POST",
      createConfApiIntegration,
      {
        operationName: "CreateInstancesConf",
        // authorizationScopes: ['aws.cognito.signin.user.admin'],
        requestValidator,
        requestModels: {
          "application/json": newInstanceConfModel,
        },
        methodResponses: [
          response201WithResponse,
          authErrorResponse,
          validationErrorResponse,
        ],
      }
    );

    const getOneConfApiFunction = Function.fromFunctionArn(
      this,
      "getOneConfApi",
      `arn:aws:lambda:${this.region}:${this.account}:function:getOneConfApi`
    );

    const getOneConfApiIntegration = new LambdaIntegration(
      getOneConfApiFunction
    );
    const instanceConfResource = instancesConfResource.addResource(
      "{alfInstanceId}"
    );
    const instanceConfResourceGet = instanceConfResource.addMethod(
      "GET",
      getOneConfApiIntegration,
      {
        operationName: "GetInstanceConf",
        // authorizationScopes: ['aws.cognito.signin.user.admin'],
        requestValidator,
        requestParameters: {
          "method.request.path.alfInstanceId": true,
          "method.request.querystring.userId": true,
        },
        methodResponses: [
          response200WithResponseModel(instanceConfModel),
          validationErrorResponse,
          authErrorResponse,
          notFoundErrorResponse,
        ],
      }
    );

    const updateApiIntegration = new LambdaIntegration(
      Function.fromFunctionArn(
        this,
        "updateApi",
        `arn:aws:lambda:${this.region}:${this.account}:function:updateApi`
      )
    );
    const instanceConfResourcePut = instanceConfResource.addMethod(
      "PUT",
      updateApiIntegration,
      {
        operationName: "UpdateInstanceConf",
        // authorizationScopes: ['aws.cognito.signin.user.admin'],
        requestValidator,
        requestParameters: {
          "method.request.path.alfInstanceId": true,
        },
        requestModels: {
          "application/json": putInstanceConfModel,
        },
        methodResponses: [
          response201WithResponse,
          validationErrorResponse,
          authErrorResponse,
          updateErrorResponse,
          notFoundErrorResponse,
        ],
      }
    );

    if (props.auth) {
      let authorizer;
      if (props.auth.mockAuth) {
        authorizer = new CfnAuthorizer(this, "cfnAuthMockLambda", {
          restApiId: api.restApiId,
          name: "MockLambdaAuthorizer",
          type: "TOKEN",
          identitySource: "method.request.header.Authorization",
          authorizerUri: props.auth.mockAuth.mockLambdaArn,
        });
      } else {
        const userPool = UserPool.fromUserPoolArn(
          this,
          "cognitoUserPool",
          props.auth.userPoolArn || ""
        );

        authorizer = new CfnAuthorizer(this, "cfnAuthCognito", {
          restApiId: api.restApiId,
          name: "CognitoAuthorizer",
          type: AuthorizationType.COGNITO,
          identitySource: "method.request.header.Authorization",
          providerArns: [userPool.userPoolArn],
        });
      }
      addCognitoAuthorizer(instancesResourceGet, authorizer);
      addCognitoAuthorizer(instanceResourceGet, authorizer);
      addCognitoAuthorizer(instancesConfResourceGet, authorizer);
      addCognitoAuthorizer(instancesConfResourcePost, authorizer);
      addCognitoAuthorizer(instanceConfResourceGet, authorizer);
      addCognitoAuthorizer(instanceConfResourcePut, authorizer);
    }

    if (props.domain) {
      const domain = api.addDomainName("apiDomainName", {
        domainName: props.domain.domainName,
        certificate: Certificate.fromCertificateArn(
          this,
          "Certificate",
          props.domain.certificateArn
        ),
        endpointType: EndpointType.EDGE,
        securityPolicy: SecurityPolicy.TLS_1_2,
      });

      new ARecord(this, "CustomDomainAliasRecord", {
        recordName: props.domain.domainName,
        zone: HostedZone.fromHostedZoneAttributes(this, "HostedZoneId", {
          zoneName: props.domain.zoneName,
          hostedZoneId: props.domain.hostedZoneId,
        }),
        target: RecordTarget.fromAlias(new ApiGatewayDomain(domain)),
      });

      const apiDomainName = new CfnOutput(this, "ApiDomainName", {
        value: api.domainName?.domainName || "",
      });
      this.cfnOutputs["ApiDomainName"] = apiDomainName;
    }

    const restApiEndPoint = new CfnOutput(this, "RestApiEndPoint", {
      value: api.urlForPath(),
    });
    this.cfnOutputs["RestApiEndPoint"] = restApiEndPoint;

    const restApiId = new CfnOutput(this, "RestApiId", {
      value: api.restApiId,
    });
    this.cfnOutputs["RestApiId"] = restApiId;
  }
}

function response200WithResponseModel(model: Model) {
  return {
    statusCode: "200",
    responseModels: {
      "application/json": model,
    },
  };
}

function addCognitoAuthorizer(method: Method, cfnAuthorizer: CfnAuthorizer) {
  const cfnInstanceConfResourcePut = method.node.defaultChild as CfnMethod;
  cfnInstanceConfResourcePut.authorizationType =
    cfnAuthorizer.type === "TOKEN" ? "CUSTOM" : cfnAuthorizer.type;
  cfnInstanceConfResourcePut.authorizerId = cfnAuthorizer.ref;
}
