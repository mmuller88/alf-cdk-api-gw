const { TypeScriptProject } = require('projen');

const project = new TypeScriptProject({
  name: "alf-cdk-api-gw",
  dependencies: {
    'alf-cdk-app-pipeline': 'github:mmuller88/alf-cdk-app-pipeline#master',
  },
});

project.addScripts({
  "build": "yarn run compile && yarn run synth",
  "cdk": "cdk",
  "synth": "cdk synth",
  "deploy": "cdk deploy",
  "diff": "cdk diff"
});

project.synth();
