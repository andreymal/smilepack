#!/usr/bin/env python3
# -*- coding: utf-8 -*-

SMILE = {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "properties": {
        "url": {
            "type": "string",
            "minLength": 9,
            "maxLength": 512
        },
        "w": {
            "type": "integer",
            "minimum": 1
        },
        "h": {
            "type": "integer",
            "minimum": 1
        }
    },
    "required": ["w", "h"]
}


SMILEPACK_SMILE = {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "id": {
                "type": "integer"
            },
            "category_name": {
                "type": "string",
                "minLength": 1,
                "maxLength": 128
            },
            "w": {
                "type": "integer",
                "minimum": 1
            },
            "h": {
                "type": "integer",
                "minimum": 1
            }
        },
        "required": ["category_name", "id"],
    },
    "minItems": 1
}


SMILEPACK_CATEGORIES = {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "minLength": 1
            },
            "description": {
                "type": "string"
            },
            "icon": {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "integer"
                    }
                },
                "required": ["id"]
            }
        },
        "required": ["name"]
    }
}


USERSCRIPT_COMPAT = {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "array",
    "items": {
        "type": "object",
        "properties": {
            "categories": {
                "type": "array",
                "items": {
                    "properties": {
                        "iconId": {
                            "type": "integer"
                        },
                        "smiles": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "id": {
                                        "type": ["string", "integer"]
                                    },
                                    "w": {
                                        "type": "integer"
                                    },
                                    "h": {
                                        "type": "integer"
                                    },
                                    "url": {
                                        "type": "string"
                                    }
                                },
                                "oneOf": [
                                    {"required": ["w", "h"]}
                                ]
                            }
                        }
                    },
                    "required": ["smiles"]
                },
            }
        },
        "required": ["categories"]
    }
}
