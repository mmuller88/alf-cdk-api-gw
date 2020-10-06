#!/usr/bin/env node
import { name } from './package.json';
import { AlfCdkEc2Stack } from './alf-cdk-ec2-stack';
import { PipelineApp, PipelineAppProps } from 'alf-cdk-app-pipeline/pipeline-app';


const pipelineAppProps: PipelineAppProps = {
  branch: 'master',
  repositoryName: name,
  customStack: (scope, account) => {
    // console.log('echo = ' + JSON.stringify(account));
    return new AlfCdkEc2Stack(scope, `${name}-${account.stage}`, {
      stackName: `${name}-${account.stage}`,
      stage: account.stage,
    })
  },
  testCommands: (account) => [
    // Use 'curl' to GET the given URL and fail if it returns an error
    'curl -Ssf $InstancePublicDnsName',
    'echo done!!!',
    `make cdkdestroy${account.stage}`,
  ],
};

// tslint:disable-next-line: no-unused-expression
new PipelineApp(pipelineAppProps);