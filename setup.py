#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys
from setuptools import setup, find_packages

if sys.version_info < (3, 4):
    print("Smilepack requires Python 3.4 or later.")
    sys.exit(1)

setup(
    name='smilepack',
    version='0.1',
    description='Smilepack',
    author='andreymal',
    author_email='andriyano-31@mail.ru',
    license='MIT',
    url='https://bitbucket.org/andreymal/smilepack',
    platforms=['linux', 'osx', 'bsd'],
    packages=find_packages(),
    install_requires=[
        'Flask',
        'Flask-Babel',
        'Flask-Script',
        'Flask-Webpack',
        'pony',
        'jsonschema',
        'pytz',
        'mysqlclient',
        'python3-memcached',
        'Flask-Limiter',
        'pymemcache',
        'Pillow',
    ],
    extras_require={
        'imgur': ['Flask-Imgur'],
    },
    include_package_data=True,
    scripts=['bin/smilepack'],
    classifiers=[
        'Development Status :: 4 - Beta',
        'Framework :: Flask',
        'License :: OSI Approved :: MIT License',
        'Operating System :: MacOS :: MacOS X',
        'Operating System :: POSIX :: BSD',
        'Operating System :: POSIX :: Linux',
        'Programming Language :: Python :: 3.4',
        'Programming Language :: Python :: 3.5',
    ],
)
