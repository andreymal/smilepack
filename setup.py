#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import io
import sys
from os.path import dirname, join
from setuptools import setup

if sys.version_info < (3, 4):
    print("Smilepack requires Python 3.4 or later.")
    sys.exit(1)


def read(*args):
    return io.open(join(dirname(__file__), *args)).read()


readme = open("README.rst").read()
history = open("HISTORY.rst").read().replace(".. :changelog:", "")

requirements = read("requirements.production.txt").splitlines(),
test_requirements = read("requirements.testing.txt").splitlines(),
extra_requirements = read("requirements.extra.txt").splitlines(),

setup(
    name='smilepack',
    version='0.1',
    description='Smilepack',
    author='andreymal',
    author_email='andriyano-31@mail.ru',
    license='MIT',
    url='https://bitbucket.org/andreymal/smilepack',
    platforms=['linux', 'osx', 'bsd'],
    packages=['smilepack'],
    install_requires=requirements,
    extras_require={
        'imgur': extra_requirements,
    },
    include_package_data=True,
    zip_safe=False,
    entry_points={
        'console_scripts': [
            'smilepack=smilepack.manage.manager:run'
        ],
    },
    classifiers=[
        'Development Status :: 4 - Beta',
        'Framework :: Flask',
        'License :: OSI Approved :: MIT License',
        'Operating System :: OS Independent',
        'Programming Language :: Python',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.4',
        'Programming Language :: Python :: 3.5',
        "Topic :: Internet :: WWW/HTTP :: WSGI",
        "Topic :: Internet :: WWW/HTTP :: WSGI :: Application",
    ],
    test_suite="tests",
    tests_require=requirements + test_requirements,
)
