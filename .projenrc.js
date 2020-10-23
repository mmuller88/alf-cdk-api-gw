const { TypeScriptProject } = require('projen');

const dependencies = {
  'alf-cdk-app-pipeline': 'github:mmuller88/alf-cdk-app-pipeline#master',
}

const name = 'alf-cdk-api-gw';
const project = new TypeScriptProject({
  name: name,
  dependencies,
  peerDependencies: dependencies,
});

const stage = '${STAGE:-dev}';

project.addScripts({
  'clean': 'rm -rf ./cdk.out && rm -rf ./cdk.out ./build',
  // skip test in build: yarn run test
  'build': 'yarn run clean && yarn install && yarn run compile',
  'cdkdeploy': `yarn run build && cdk deploy ${name}-${stage} --profile damadden88 --require-approval never`,
  'cdksynth': `yarn run build && cdk synth ${name}-${stage} --profile damadden88`,
  'cdkdestroy': `yarn run build && yes | cdk destroy ${name}-${stage} --profile damadden88`,
  'cdkpipelinediff': `yarn run build && cdk diff ${name}-pipeline --profile damadden88 || true`,
  'cdkpipelinedeploy': `yarn run build && cdk deploy ${name}-pipeline --profile damadden88 --require-approval never`,
});

project.tsconfig.compilerOptions.rootDir=undefined;

project.synth();
