#!/usr/bin/env python3
# -*- coding: utf-8 -*-

USER = {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "properties": {
        "username": {
            "type": "string",
            "minLength": 2,
            "maxLength": 32
        },
        "password": {
            "type": "string",
            "minLength": 8,
            "maxLength": 32
        },
        "is_admin": {
            "type": "boolean"
        },
        "is_superadmin": {
            "type": "boolean"
        },
        "is_active": {
            "type": "boolean"
        }
    }
}


ICON = {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "properties": {
        "url": {
            "type": "string",
            "minLength": 9,
            "maxLength": 512
        },
        "approved": {
            "type": "boolean"
        }
    }
}


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

    }
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

    }
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

    }
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
        },
        "hidden": {
            "type": "boolean"
        }
    }
}


SMILEPACK = {
    "$schema": "http://json-schema.org/draft-04/schema#",
    "type": "object",
    "properties": {
        "name": {
            "type": "string",
            "minLength": 0,
            "maxLength": 64
        },
        "fork": {
            "type": ["string", "null"]
        },
        "edit": {
            "type": ["string", "null"]
        },
        "categories": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {
                        "type": "string",
                        "minLength": 0,
                        "maxLength": 128
                    },
                    "description": {
                        "type": "string",
                        "minLength": 0,
                        "maxLength": 16000
                    },
                    "icon": {
                        "type": "integer"
                    }
                },
                "required": ["icon"]
            }
        },
        "smiles": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "integer"
                    },
                    "category": {
                        "type": "integer",
                        "mininum": 0
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
                "required": ["category", "id"],
            }
        },
        "lifetime": {
            "type": "integer"
        }
    },
    "required": ["categories", "smiles"]
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
