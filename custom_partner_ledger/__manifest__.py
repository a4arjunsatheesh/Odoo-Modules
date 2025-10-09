{
    'name': 'Custom Partner Ledger',
    'version': '16.0.1.0.0',
    'category': 'Accounting',
    'summary': 'Customization of the Partner Ledger to create a new pdf report '
               'to print the Previous Balance.',
    'description': """Implemented a customization in the Partner Ledger report 
    to replace the default ‘Initial Balance’ entry with a ‘Previous Balance’ 
    line. This enhancement ensures clearer financial visibility by showing the 
    carried-forward balance prior to the reporting period, both in the on-screen
     report and the exported PDF.""",
    'author': 'Arjun',
    'company': 'Arjun',
    'maintainer': 'Arjun',
    'depends': ['account_accountant'],
    'data': [
        'views/templates.xml',
    ],
    'license': 'AGPL-3',
    'installable': True,
    'application': False,
    'auto_install': False,
}
