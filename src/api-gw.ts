import { StackProps, Construct } from '@aws-cdk/core';
import { Role, ServicePrincipal, PolicyStatement } from '@aws-cdk/aws-iam';
import { CustomStack } from 'alf-cdk-app-pipeline/custom-stack';

export interface ApiGwStackProps extends StackProps {
  stage: string;
};

export class ApiGwStack extends CustomStack{

  constructor(scope: Construct, id: string, props: ApiGwStackProps){
    super(scope, id, props);

    const apiRole = new Role(this, 'apiRole', {
      roleName: `testRole-${props.stage}`,
      assumedBy: new ServicePrincipal('apigateway.amazonaws.com'),
    });

    apiRole.addToPolicy(new PolicyStatement({
      resources: ['*'],
      actions: ['lambda:InvokeFunction'],
    }));

    // const apiDomainName = new CfnOutput(scope, 'ApiDomainName', {
    //   value: api.domainName?.domainName || ''
    // });
    // scope.cfnOutputs['ApiDomainName'] = apiDomainName;
  }
}