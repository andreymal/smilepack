#!/usr/bin/env python3
# -*- coding: utf-8 -*-

# for debug=True in Flask
import sys
if '' not in sys.path:
    sys.path.insert(0, '')

from smilepack import manage
manage.manager.run()
