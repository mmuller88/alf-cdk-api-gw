# alf-cdk-api-gw

AWS CDK Deployment

## Deploy

Run `cdk bootstrap aws://<ACCOUNT-NUMBER>/<REGION>`for deploying the cdk toolkit stack
Run `yarn run cdkdeploy`. This will build and deploy / redeploy your Stack to your AWS Account.

After the deployment you will see the API's URL, which represents the url you can then use.

## Destroy

Run `yarn run cdkdestroy`
