build:
	rm -rf dist
	yarn ncc build src/index.ts -m
	yarn ncc build src/post.ts -o dist/post -m
	yarn ncc build src/setup.ts -o dist/setup -m
	yarn ncc build src/reconcile.ts -o dist/reconcile -m
update_built: build
	rm -rf built || true
	mkdir built && cd built && git init && git checkout -b built
	cp -r dist/ built/
	cp action.yml built/
	cp -r setup/ built/
	cp -r reconcile/ built/
	export REMOTE=$(git config remote.release.url) && \
	cd built && git remote add built $REMOTE
	cd built && git add . && git commit -m "chore: rebuilt"
	cd built && git push -u built --force HEAD:built
update_tag TAG: update_built
	cd built && git tag {{TAG}} && git push --tags
