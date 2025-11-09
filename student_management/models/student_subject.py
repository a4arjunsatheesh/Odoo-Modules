from odoo import fields, models


class StudentSubject(models.Model):
    _name = "student.subject"
    _description = "Student Subject"

    name = fields.Char(string="Name", help="Name of the subject", required=True)
    max_marks = fields.Float(string="Maximum Mark",
                             help="Maximum mark for the the subject")
    passing_marks = fields.Float(string="Passing Mark",
                                 help="Passing mark for the subject")
