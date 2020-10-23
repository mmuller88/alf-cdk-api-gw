import { name } from '../package.json';
import { ApiGwStack } from './api-gw';
import { PipelineApp, PipelineAppProps } from 'alf-cdk-app-pipeline/pipeline-app';
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

    return new ApiGwStack(scope, `${name}-${stageAccount.stage}`, {
      env: {
        account: stageAccount.account.id,
        region: stageAccount.account.region,
      },
      stage: stageAccount.stage,
    })
  },
  manualApprovals: (account) => {
    return account.stage === 'dev' ? false : true
  },
  testCommands: (_) => [
    // `curl -Ssf $InstancePublicDnsName && aws cloudformation delete-stack --stack-name itest123 --region ${account.region}`,
    // 'curl -Ssf $CustomInstanceUrl',
    // 'echo done! Delete all remaining Stacks!',
  ],
};

// tslint:disable-next-line: no-unused-expression
new PipelineApp(pipelineAppProps);
