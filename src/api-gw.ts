// import { Role, ServicePrincipal, PolicyStatement } from '@aws-cdk/aws-iam';
import { StackProps, Construct, CfnOutput } from '@aws-cdk/core';
import { CustomStack } from 'alf-cdk-app-pipeline/custom-stack';
import { EndpointType, SecurityPolicy, RestApi, Cors, MockIntegration, JsonSchemaType, JsonSchema, Model } from '@aws-cdk/aws-apigateway';
import { Certificate } from '@aws-cdk/aws-certificatemanager';
import { ARecord, HostedZone, RecordTarget } from '@aws-cdk/aws-route53';
import { ApiGatewayDomain } from '@aws-cdk/aws-route53-targets';

export interface ApiGwStackProps extends StackProps {
  stage: string;
  allowedOrigins: string[];
  domain?: {
    domainName: string,
    certificateArn: string,
    zoneName: string,
    hostedZoneId: string,
  }
};

export class ApiGwStack extends CustomStack {

  constructor(scope: Construct, id: string, props: ApiGwStackProps) {
    super(scope, id, props);

    const api = new RestApi(this, 'RestApi', {
      restApiName: 'Alf Instance Service',
    });

    const alfInstanceId = {
      maxLength: 5,
      minLength: 5,
      pattern: "[a-z0-9]{5,5}",
      type: JsonSchemaType.STRING,
      additionalProperties: false,
      description: "User Instance Identifier created with node uuid. Consists of 5 characters!"
    }

    const instanceSchema: JsonSchema = {
      required : [ "adminCredentials", "alfInstanceId", "status" ],
      type : JsonSchemaType.OBJECT,
      properties : {
        alfInstanceId,
        status : {
          type: JsonSchemaType.STRING,
          description: "Shows the current state. Even if your instance is in the running state it might take some minutes until the provided url is reachable.",
          enum: [ "running", "terminated", "stopped", "pending", "stopping" ],
          // default: "running",
        },
        adminCredentials : {
          required : [ "password", "userName" ],
          type : JsonSchemaType.OBJECT,
          properties : {
            userName : {
              type: JsonSchemaType.STRING,
            },
            password: {
              type: JsonSchemaType.STRING,
            }
          },
          additionalProperties : false
        },
        url: {
          type: JsonSchemaType.STRING,
          description: "The Url to access ACA. Currently only http is supported. Urls are ACA = ../ Share = ../share Alfresco = ../alfresco . It takes up to 3 minutes until this url becomes available. In future I plan to implement a healthcheck (probably leveraging AWS AutoScaling) to make the readiness of ACS more feaseble.\n\nThe propagation of the DNS Record normally takes a bit longer. Alternatively you can use the awsUrl to access your instance."
        },
        awsUrl: {
          type: JsonSchemaType.STRING,
          description: "Alternative url for the Alfresco instance."
        }
      },
      additionalProperties: false
    }

    const expectedStatus = {
      type: JsonSchemaType.STRING,
      description: "The state you are allow to put your instance in. Warning putting instances into terminated will delete the instance-conf and instance!",
      enum: [ "running", "terminated", "stopped" ],
      // default: "running"
    };

    const userId = {
      maxLength: 64,
      minLength: 2,
      pattern: "[a-zA-Z0-9]{2,64}",
      type: JsonSchemaType.STRING,
      additionalProperties: false,
      description: "Simple user name. Please use your user name from the system.",
    };

    const instanceConfSchema: JsonSchema = {
      additionalProperties: false,
      allOf: [{
        required: [ "userId" ],
        type: JsonSchemaType.OBJECT,
        properties: {
          alfType: {
            required: [ "ec2InstanceType", "gitRepo" ],
            type: JsonSchemaType.OBJECT,
            properties: {
              ec2InstanceType: {
                type: JsonSchemaType.STRING,
                description: "Supported Ec2 Instance Type. Supported are:\nt2.large - 2 CPU, 8 GB RAM\nt2.xlarge - 4 CPU, 16 GB RAM\n",
                enum: [ "t2.large", "t2.xlarge" ],
                // default: "t2.large"
              },
              gitRepo: {
                type: JsonSchemaType.STRING,
                description: "Name of supported Alfresco Docker Compose Deployment deployed with the Alfresco installer.\nalf-ec-1 : ACS 6.2 Community, ACA\n",
                enum: [ "alf-ec2-1" ],
                // default: "alf-ec2-1"
              }
            },
            additionalProperties: false
          },
          // tags: {
          //   ref: "https://apigateway.amazonaws.com/restapis/nd7foc8cn9/models/tags"
          // },
          userId
        },
        additionalProperties: false
      }, {
        required: [ "alfInstanceId", "expectedStatus" ],
        properties: {
          alfInstanceId,
          expectedStatus,
        }
      }]
    }

    const putInstanceConfSchema: JsonSchema = {
      required: [ "userId" ],
      type: JsonSchemaType.OBJECT,
      properties: {
        expectedStatus,
        userId,
      },
      additionalProperties: false,
    };

    const instanceConfListModel = api.addModel('InstanceConfList', {
      modelName: 'InstanceConfList',
      schema: {
        type: JsonSchemaType.ARRAY,
        additionalProperties: false,
        items : [instanceConfSchema],
      }
    })

    const instanceConfModel = api.addModel('InstanceConf', {
      modelName: 'InstanceConf',
      schema: instanceConfSchema,
    });

    // const instanceList: Model = 
    const instanceListModel = api.addModel('InstanceList', {
      modelName: 'InstanceList',
      schema: {
        type: JsonSchemaType.ARRAY,
        additionalProperties: false,
        items : [instanceSchema]
      }
    });

    const instanceModel = api.addModel('Instance', {
      modelName: 'Instance',
      schema: instanceSchema,
    });

    const putInstanceConfModel = api.addModel('PutInstanceConf', {
      modelName: 'PutInstanceConf',
      schema: putInstanceConfSchema,
    });

    // Error Model
    const errorSchema = {
      required: [ "message" ],
      properties: {
        message: {
          type: JsonSchemaType.STRING,
        }
      }
    };

    // const errorModel = api.addModel('Error', {
    //   modelName: 'Error',
    //   schema: errorSchema,
    // });
    // errorModel;

    const authErrorModel = api.addModel('AuthError', {
      modelName: 'AuthError',
      schema: errorSchema,
    });

    const notFoundErrorModel = api.addModel('NotFoundError', {
      modelName: 'NotFoundError',
      schema: errorSchema,
    });

    const validationErrorModel = api.addModel('ValidationError', {
      modelName: 'ValidationError',
      schema: {
        required: [ "message", "validationErrors" ],
        properties: {
          message: {
            type: JsonSchemaType.STRING,
          },
          validationErrors: {
            type: JsonSchemaType.STRING,
          }
        }
      },
    });

    const updateErrorModel = api.addModel('UpdateError', {
      modelName: 'UpdateError',
      schema: {
        required: [ "message", "instanceConf" ],
        properties: {
          message: {
            type: JsonSchemaType.STRING,
          },
          instanceConf: instanceConfSchema,
        }
      },
    });

    const authErrorResponse = {
      statusCode: '401',
      responseModels: {
        'application/json': authErrorModel,
      }
    };

    const validationErrorResponse = {
      statusCode: '400',
      responseModels: {
        'application/json': validationErrorModel,
      },
    };

    const updateErrorResponse = {
      statusCode: '403',
      responseModels: {
        'application/json': updateErrorModel,
      },
    };

    const notFoundErrorResponse = {
      statusCode: '404',
      responseModels: {
        'application/json': notFoundErrorModel,
      },
    };

    const mock = new MockIntegration({});

    const instancesResource = api.root.addResource('instances', {
      defaultCorsPreflightOptions: {
        allowOrigins: props.allowedOrigins,
        allowMethods: Cors.ALL_METHODS,
      },
    });

    instancesResource.addMethod('GET', mock, {
      requestParameters: {
        'method.request.querystring.userId': false,
      },
      methodResponses: [
        response200WithResponseModel(instanceListModel),
        authErrorResponse,
      ]
    });

    const instanceResource = instancesResource.addResource('{alfInstanceId}');
    instanceResource.addMethod('GET', mock, {
      requestParameters: {
        'method.request.path.alfInstanceId': true,
      },
      methodResponses: [{
        statusCode: '200',
        responseModels: {
          'application/json': instanceModel,
        },
      },
        validationErrorResponse,
        authErrorResponse,
        notFoundErrorResponse,
      ]
    });

    const instancesConfResource = api.root.addResource('instances-conf', {
      defaultCorsPreflightOptions: {
        allowOrigins: props.allowedOrigins,
        allowMethods: Cors.ALL_METHODS,
      },
    });
    instancesConfResource.addMethod('GET', mock, {
      requestParameters: {
        'method.request.querystring.userId': true,
      },
      methodResponses: [
        response200WithResponseModel(instanceConfListModel),
        authErrorResponse,
      ]
    });

    const response201WithResponse = {
      statusCode: '201',
      responseModels: {
        'application/json': instanceConfModel,
      },
    }

    instancesConfResource.addMethod('POST', mock, {
      requestModels: {
        'application/json': putInstanceConfModel,
      },
      methodResponses: [
        response201WithResponse,
        authErrorResponse,
        validationErrorResponse,
        notFoundErrorResponse,
      ]
    });

    const instanceConfResource = instancesConfResource.addResource('alfInstanceId');
    instanceConfResource.addMethod('GET', mock, {
      requestParameters: {
        'method.request.path.alfInstanceId': true,
        'method.request.querystring.userId': true,
      },
      methodResponses: [
        response200WithResponseModel(instanceConfModel),
        validationErrorResponse,
        authErrorResponse,
        notFoundErrorResponse,
      ]
    });

    instanceConfResource.addMethod('PUT', mock, {
      requestParameters: {
        'method.request.path.alfInstanceId': true,
      },
      requestModels: {
        'application/json': putInstanceConfModel,
      },
      methodResponses: [
        response201WithResponse,
        validationErrorResponse,
        authErrorResponse,
        updateErrorResponse,
        notFoundErrorResponse,
      ]
    });

    if(props.domain){
      const domain = props.domain;
      const domainName = api.addDomainName('apiDomainName', {
        domainName: domain.domainName,
        certificate: Certificate.fromCertificateArn(this, 'Certificate', domain.certificateArn),
        endpointType: EndpointType.EDGE, // default is REGIONAL
        securityPolicy: SecurityPolicy.TLS_1_2,
      });

      new ARecord(this, 'CustomDomainAliasRecord', {
        recordName: domain.domainName,
        zone: HostedZone.fromHostedZoneAttributes(this, 'HostedZoneId', {zoneName: domain.zoneName, hostedZoneId: domain.hostedZoneId}),
        target: RecordTarget.fromAlias(new ApiGatewayDomain(domainName))
      });
    }

    const apiDomainName = new CfnOutput(this, 'ApiDomainName', {
      value: api.domainName?.domainName || ''
    });
    this.cfnOutputs['ApiDomainName'] = apiDomainName;
  }
}

function response200WithResponseModel(model: Model) {
  return {
    statusCode: '200',
    responseModels: {
      'application/json': model,
    },
  }
}