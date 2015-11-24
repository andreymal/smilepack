.PHONY: clean-pyc clean-build clean-test clean-frontend clean-translations clean lint test test-all docs

help:
	@echo "Smilepack"
	@echo
	@echo "clean - remove all build, test, coverage, frontend and Python artifacts"
	@echo "clean-build - remove build artifacts"
	@echo "clean-pyc - remove Python file artifacts"
	@echo "clean-test - remove test and coverage artifacts"
	@echo "clean-frontend - remove webpack frontend artifacts"
	@echo "lint - check style with pylint"
	@echo "test - run tests quickly with the default Python"
	@echo "test-all - run tests on every Python version with tox"
	@echo "coverage - check code coverage quickly with the default Python"
	@echo "docs - generate Sphinx HTML documentation, including API docs"
	@echo "release - package and upload a release"
	@echo "dist - package"
	@echo "install - install the package to the active Python's site-packages"
	@echo "develop - install the package for development as editable"

clean: clean-build clean-pyc clean-test clean-frontend clean-translations

clean-build:
	rm -fr build/
	rm -fr dist/
	rm -fr .eggs/
	find . -name '*.egg-info' -exec rm -fr {} +
	find . -name '*.egg' -exec rm -rf {} +

clean-pyc:
	find . -name '*.pyc' -exec rm -f {} +
	find . -name '*.pyo' -exec rm -f {} +
	find . -name '*~' -exec rm -f {} +
	find . -name '__pycache__' -exec rm -fr {} +

clean-test:
	rm -fr .tox/
	rm -f .coverage
	rm -fr htmlcov/

clean-frontend:
	npm run-script clean

clean-translations:
	rm -f smilepack/translations/*/LC_MESSAGES/*.mo

lint:
	python setup.py lint \
	--lint-packages smilepack \
	--lint-rcfile pylintrc

test:
	python setup.py test

test-all:
	tox

coverage:
	coverage run --source smilepack setup.py test
	coverage report -m
	coverage html
	x-www-browser htmlcov/index.html

docs:
	@echo "Docs doesn't yet exists"

release: clean
	python setup.py sdist upload
	npm run-script webpack:production
	pybabel compile -d smilepack/translations
	python setup.py bdist_wheel upload

dist: clean
	python setup.py sdist
	npm run-script webpack:production
	pybabel compile -d smilepack/translations
	python setup.py bdist_wheel
	ls -l dist

install: clean
	python setup.py install

develop:
	npm install
	npm run-script webpack:trunk
	pip install -r requirements.development.txt
	python setup.py develop
	pybabel compile -d smilepack/translations
