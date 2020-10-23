import { sharedDevAccountProps, sharedProdAccountProps } from 'alf-cdk-app-pipeline/accountConfig';
import { PipelineApp, PipelineAppProps } from 'alf-cdk-app-pipeline/pipeline-app';
import { name } from '../package.json';
import { ApiGwStack } from './api-gw';
// import { sharedDevAccountProps, sharedProdAccountProps } from 'alf-cdk-app-pipeline/accountConfig';

// const name = 'alf-cdk-api-gw';

const pipelineAppProps: PipelineAppProps = {
  branch: 'master',
  repositoryName: name,
  stageAccounts: [
    {
      account: {
        id: '981237193288',
        region: 'eu-central-1',
      },
      stage: 'dev',
    },
    {
      account: {
        id: '981237193288',
        region: 'us-east-1',
      },
      stage: 'prod',
    },
  ],
  buildAccount: {
    id: '981237193288',
    region: 'eu-central-1',
  },
  customStack: (scope, stageAccount) => {

    const alfCdkSpecifics = {
      ...(stageAccount.stage === 'dev' ? {
        allowedOrigins: [
          'https://openapi.dev.alfpro.net',
          'https://api.dev.alfpro.net',
          'https://app.dev.alfpro.net',
          'http://localhost:3000'
        ],
        domain: {
          domainName: `api.${sharedDevAccountProps.zoneName.slice(0,-1)}`,
          zoneName: sharedDevAccountProps.zoneName,
          hostedZoneId: sharedDevAccountProps.hostedZoneId,
          certificateArn: `arn:aws:acm:us-east-1:${stageAccount.account.id}:certificate/f605dd8c-4ae3-4c1b-9471-4b152e0f8846`
        },
      } : { // prod
        allowedOrigins: [
          'https://api.alfpro.net',
          'https://app.alfpro.net',
          'https://www.alfpro.net',
          'https://www.alfpro.net',
          'http://localhost:3000'
        ],
        domain: {
          domainName: `api.${sharedProdAccountProps.zoneName.slice(0,-1)}`, // 'api.alfpro.net',
          zoneName: sharedProdAccountProps.zoneName,
          hostedZoneId: sharedProdAccountProps.hostedZoneId,
          certificateArn: `arn:aws:acm:us-east-1:${stageAccount.account.id}:certificate/62010fca-125e-4780-8d71-7d745ff91789`
        },
      })
    };

    return new ApiGwStack(scope, `${name}-${stageAccount.stage}`, {
      env: {
        account: stageAccount.account.id,
        region: stageAccount.account.region,
      },
      stackName: `${name}-${stageAccount.stage}`,
      stage: stageAccount.stage,
      allowedOrigins: alfCdkSpecifics.allowedOrigins,
      domain: alfCdkSpecifics.domain,
    });
  },
  manualApprovals: (account) => {
    return account.stage === 'dev' ? false : true;
  },
  testCommands: (stageAccount) => [
    ...(stageAccount.stage==='devv'? [
      `npx newman run test/alf-cdk.postman_collection.json --env-var baseUrl=$RestApiEndPoint -r cli,json --reporter-json-export tmp/newman/report.json --export-environment tmp/newman/env-vars.json --export-globals tmp/newman/global-vars.json`,
      'echo done! Delete all remaining Stacks!',
      `aws cloudformation describe-stacks --query "Stacks[?Tags[?Key == 'alfInstanceId'][]].StackName" --region ${stageAccount.account.region} --output text |
      awk '{print $1}' |
      while read line;
      do aws cloudformation delete-stack --stack-name $line --region ${stageAccount.account.region};
      done`,
    ] : []),
  ],
};

// tslint:disable-next-line: no-unused-expression
new PipelineApp(pipelineAppProps);
