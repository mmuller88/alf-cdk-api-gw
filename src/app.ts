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
        domain: {
          domainName: `api.${sharedDevAccountProps.zoneName.slice(0,-1)}`,
          zoneName: sharedDevAccountProps.zoneName,
          hostedZoneId: sharedDevAccountProps.hostedZoneId,
          certificateArn: `arn:aws:acm:us-east-1:${stageAccount.account.id}:certificate/f605dd8c-4ae3-4c1b-9471-4b152e0f8846`
        },
      } : { // prod
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
      domain: alfCdkSpecifics.domain,
    });
  },
  manualApprovals: (account) => {
    return account.stage === 'dev' ? false : true;
  },
  testCommands: (_) => [
    // `curl -Ssf $InstancePublicDnsName && aws cloudformation delete-stack --stack-name itest123 --region ${account.region}`,
    // 'curl -Ssf $CustomInstanceUrl',
    // 'echo done! Delete all remaining Stacks!',
  ],
};

// tslint:disable-next-line: no-unused-expression
new PipelineApp(pipelineAppProps);
