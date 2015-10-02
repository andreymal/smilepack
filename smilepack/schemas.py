#!/usr/bin/env python3
# -*- coding: utf-8 -*-

smilepack_smiles_schema = {
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
                "minLength": 1
            },
            "url": {
                "type": "string",
                "minLength": 9
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
        "oneOf": [
            {"required": ["category_name", "id"]},
            {"required": ["category_name", "url", "w", "h"]},
        ]
    },
    "minItems": 1
}


smilepack_categories_schema = {
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


smile_suggestion_schema = {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "properties": {
        "category": {
            "type": "integer"
        },
        "url": {
            "type": "string",
            "minLength": 9
        },
        "description": {
            "type": "string"
        },
    },
    "required": ["url"]
}
