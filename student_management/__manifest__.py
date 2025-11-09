{
    "name": "Student Management",
    "version": "18.0.1.0.0",
    "category": "Extra Tools",
    "author": "Arjun",
    "summary": "Custom module to handle student management ",
    "depends": ['base'],
    "data": [
        'security/ir.model.access.csv',
        'views/student_student_views.xml',
        'views/student_subject_views.xml',
        'views/student_management_menuitems.xml',
    ],
    'installable': True,
    'application': False,
    'license': 'OPL-1',
}
