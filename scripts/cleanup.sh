PROFILE=${1}
REGION=${2:-eu-central-1}

aws cloudformation describe-stacks --query "Stacks[?Tags[?Key == 'instanceId'][]].StackName" $PROFILE --region $REGION --output text | \
awk '{print $1}' | \
while read line; do \
    echo "delete $line" \
    aws cloudformation delete-stack --stack-name $line $PROFILE --region $REGION; \
done

echo done! Delete all remaining Items in DynamoDB table!
aws dynamodb scan --attributes-to-get userId instanceId --table-name alfInstances $PROFILE --region $REGION --query "Items[*]" | jq --compact-output '.[]' | tr '\n' '\0' |
xargs -0 -t -I keyItem aws dynamodb delete-item --table-name alfInstances --key=keyItem $PROFILE --region $REGION --out json