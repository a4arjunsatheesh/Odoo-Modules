{
    "name": "Studio Community",
    "summary": "Starter module for community-edition studio-like features",
    "version": "18.0.1.0.0",
    "category": "Tools",
    "author": "Custom",
    "license": "LGPL-3",
    "depends": ["base", "web"],
    "assets": {
        "web.assets_backend": [
            "studio_community/static/src/js/studio_view_context.js",
            "studio_community/static/src/js/studio_systray.js",
            "studio_community/static/src/xml/studio_systray.xml",
            "studio_community/static/src/scss/studio_systray.scss",
        ],
    },
    "data": [],
    "installable": True,
    "application": True,
}
