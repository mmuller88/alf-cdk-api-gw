.DEFAULT_GOAL := build

PACKAGE_NAME := $(shell node -p "require('./package.json').name")

check-env:
ifeq ($(PACKAGE_NAME),)
	$(error PACKAGE_NAME is empty)
endif
ifeq ($(PACKAGE_NAME),undefined)
	$(error PACKAGE_NAME is undefined)
endif

.PHONY: prepare
prepare:
	echo "not implemented"

.PHONY: install
install:
	yarn install

.PHONY: clean
clean:
	rm -rf ./cdk.out ./cdk/cdk.out ./build ./package ./cdk/build

.PHONY: build
build: clean install
	yarn run build

.PHONY: test
test:
	echo "not implemented"

.PHONY: cdkclean
cdkclean:
	rm -rf ./cdk.out && rm -rf ./cdk.out ./build

.PHONY: cdkbuild
cdkbuild: cdkclean install
	yarn run build

.PHONY: cdkdiff
cdkdiff: cdkclean cdkbuild build
	cdk diff '$(PACKAGE_NAME)-${STAGE}' --profile damadden88 || true

.PHONY: cdkdeploy
cdkdeploy: cdkclean cdkbuild build
	cdk deploy '$(PACKAGE_NAME)-${STAGE}' --profile damadden88 --require-approval never

.PHONY: cdkdestroy
cdkdestroy: cdkclean cdkbuild
	yes | cdk destroy '$(PACKAGE_NAME)-${STAGE}' --profile damadden88

.PHONY: cdksynth
cdksynth: cdkclean cdkbuild build
	cdk synth '$(PACKAGE_NAME)-${STAGE}'--profile damadden88

.PHONY: cdkpipelinediff
cdkpipelinediff: check-env cdkclean cdkbuild
	cdk diff "$(PACKAGE_NAME)-pipeline-stack-build" --profile damadden88 || true

.PHONY: cdkpipelinedeploy
cdkpipelinedeploy: check-env cdkclean cdkbuild
	cdk deploy "$(PACKAGE_NAME)-pipeline-stack-build" --profile damadden88 --require-approval never