#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import sys

if sys.version_info < (3, 4):
    print("Smilepack requires Python 3.4 or later.")
    sys.exit(1)

from setuptools import setup, find_packages


setup(
    name='smilepack',
    version='0.1',
    description='Smilepack',
    author='andreymal',
    license='MIT',
    url='https://bitbucket.org/andreymal/smilepack',
    packages=find_packages(),
    install_requires=[
        'Flask',
        'Flask-Babel',
        'Flask-Script',
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
        'bundle': ['jsmin'],
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
