from odoo import api, fields, models


class StudentStudent(models.Model):
    _name = "student.student"
    _description = "Student"

    name = fields.Char(string="Name", help="Name of the student", required=1)
    age = fields.Integer(string="Age", help="Age of the student")
    grade = fields.Selection(
        [('A', 'A'), ('B', 'B'), ('C', 'C'), ('D', 'D'), ('E', 'E'),
         ('F', 'F')], string="Grade", help="Grade of the student")
    total = fields.Float(string="Total", help="Total marks of the student")
    passed = fields.Boolean(string="Passed", help="Student is passed?",
                            compute="_compute_passed")
    subject_ids = fields.One2many('student.subject.line', 'student_id',
                                  string="Subjects",
                                  help="Subject details of the student")

    @api.depends('subject_ids')
    def _compute_passed(self):
        for student in self:
            student.passed = True
            for subject_line in student.subject_ids:
                if subject_line.marks_obtained <= subject_line.subject_id.passing_marks:
                    student.passed = False


class StudentSubjectLine(models.Model):
    _name = "student.subject.line"
    _description = "Student Subject Line"

    subject_id = fields.Many2one('student.subject', string="Subject",
                                 help="Subject of the student")
    marks_obtained = fields.Float(string="Marks Obtained",
                                  help="Marks obtained by the student")
    student_id = fields.Many2one('student.student', string="Student",
                                 help="Student of the subject")
