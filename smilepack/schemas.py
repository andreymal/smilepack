#!/usr/bin/env python3
# -*- coding: utf-8 -*-

SECTION = {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "properties": {
        "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 128
        },
        "icon": {
            "type": "integer"
        },
        "description": {
            "type": "string",
            "minLength": 0,
            "maxLength": 16000
        }

    },
    "required": ["name", "icon"]
}


SUBSECTION = {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "properties": {
        "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 128
        },
        "icon": {
            "type": "integer"
        },
        "section": {
            "type": "integer"
        },
        "description": {
            "type": "string",
            "minLength": 0,
            "maxLength": 16000
        }

    },
    "required": ["name", "icon", "section"]
}


CATEGORY = {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "properties": {
        "name": {
            "type": "string",
            "minLength": 1,
            "maxLength": 128
        },
        "icon": {
            "type": "integer"
        },
        "subsection": {
            "type": "integer"
        },
        "description": {
            "type": "string",
            "minLength": 0,
            "maxLength": 16000
        }

    },
    "required": ["name", "icon", "subsection"]
}


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
        },
        "category": {
            "type": ["integer", "null"]
        },
        "description": {
            "type": "string",
            "minLength": 0,
            "maxLength": 16000
        },
        "tags": {
            "type": "array",
            "items": {
                "type": "string",
                "minLength": 1,
                "maxLength": 48
            }
        },
        "add_tags": {
            "type": "array",
            "items": {
                "type": "string",
                "minLength": 1,
                "maxLength": 48
            }
        },
        "remove_tags": {
            "type": "array",
            "items": {
                "type": "string",
                "minLength": 1,
                "maxLength": 48
            }
        },
        "approved": {
            "type": "boolean"
        }
    }
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
