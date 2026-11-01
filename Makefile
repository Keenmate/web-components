# @keenmate/web-components-devkit — repo tasks.
#
# The devkit is plain ESM (no build): `src/`, `templates/` and `components.json`
# ship as they are. The publish targets gate on the same rules the components'
# generated Makefile uses (`kmwc check-release`: the version fits the dist-tag
# and isn't on npm yet), then run the unit tests and the README / contract checks.
#
# The demo site is the playground (a real component made by `kmwc new`): the
# standard dev targets delegate to its generated Makefile, so ports and
# behaviour are the ones every component gets.

.PHONY: help setup dev kill-port build-examples preview-examples test test-e2e readme readme-check check-contract verify publish-dry publish-dry-rc publish publish-rc

help: ## Show this help message
	@echo "Available targets:"
	@grep -hE '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-18s %s\n", $$1, $$2}'

setup: ## Install dependencies (devkit + playground)
	npm install
	cd playground && npm install

dev: ## Start the playground dev server (examples on http://localhost:17300)
	$(MAKE) -C playground dev

kill-port: ## Free the playground dev/preview ports (17300, 17301)
	$(MAKE) -C playground kill-port

build-examples: ## Build the playground's static examples site (playground/dist-examples/)
	$(MAKE) -C playground build-examples

preview-examples: ## Build + serve the playground's examples site (http://localhost:17301)
	$(MAKE) -C playground preview-examples

test: ## Unit tests (node:test)
	npm test

test-e2e: ## Playground e2e (Playwright; needs playground deps + browsers)
	npm run test:e2e

readme: ## Regenerate the README component catalogue from components.json
	npm run readme

readme-check: ## Fail if the README catalogue is out of date
	npm run readme:check

check-contract: ## base-contract-check over src, templates and playground
	npm run check:contract

verify: ## List what would be published
	npm pack --dry-run

publish-dry: ## Dry-run publish as 'latest'
	npm publish --dry-run

publish-dry-rc: ## Dry-run publish under --tag rc
	npm publish --dry-run --tag rc

publish: ## Publish to npm as 'latest' (release versions only)
	node src/cli/kmwc.js check-release --tag latest
	@echo "WARNING: publishing to npm under the 'latest' dist-tag. Use 'make publish-rc' for pre-releases."
	@$(CONFIRM)
	npm test
	npm run readme:check
	npm run check:contract
	npm publish

publish-rc: ## Publish to npm under the 'rc' dist-tag (does NOT touch 'latest')
	node src/cli/kmwc.js check-release --tag rc
	@echo "WARNING: publishing to npm under the 'rc' dist-tag."
	@$(CONFIRM)
	npm test
	npm run readme:check
	npm run check:contract
	npm publish --tag rc

ifeq ($(OS),Windows_NT)
CONFIRM = powershell -NoProfile -Command "Write-Host 'Press Enter to continue, Ctrl+C to cancel...'; Read-Host | Out-Null"
else
CONFIRM = read -p "Press Enter to continue, Ctrl+C to cancel... " _
endif
