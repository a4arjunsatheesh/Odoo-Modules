from odoo import models, _
from odoo.tools import config
import markupsafe


class AccountReport(models.Model):
    _inherit = "account.report"

    def _init_options_buttons(self, options, previous_options=None):
        options['buttons'] = [
            {'name': _('PDF'), 'sequence': 10, 'action': 'export_file',
             'action_param': 'export_to_pdf', 'file_export_type': _('PDF')},
            {'name': _('XLSX'), 'sequence': 20, 'action': 'export_file',
             'action_param': 'export_to_xlsx', 'file_export_type': _('XLSX')},
            {'name': _('Save'), 'sequence': 100,
             'action': 'open_report_export_wizard'},
            {'name': _('PDF 2'), 'sequence': 110, 'action': 'export_file',
             'action_param': 'export_to_pdf2', 'file_export_type': _('PDF')},
        ]

    def export_to_pdf2(self, options):
        self.ensure_one()
        if not config['test_enable']:
            self = self.with_context(commit_assetsbundle=True)
        base_url = self.env['ir.config_parameter'].sudo().get_param(
            'report.url') or self.env['ir.config_parameter'].sudo().get_param(
            'web.base.url')
        rcontext = {
            'mode': 'print',
            'base_url': base_url,
            'company': self.env.company,
        }
        print_mode_self = self.with_context(print_mode=True,
                                            export_to_pdf2=True)
        print_options = print_mode_self._get_options(previous_options=options)
        body_html = print_mode_self.get_html(print_options,
                                             self._filter_out_folded_children(
                                                 print_mode_self._get_lines(
                                                     print_options)))
        body = self.env['ir.ui.view']._render_template(
            "account_reports.print_template",
            values=dict(rcontext, body_html=body_html),
        )
        footer = self.env['ir.actions.report']._render_template(
            "web.internal_layout", values=rcontext)
        footer = self.env['ir.actions.report']._render_template(
            "web.minimal_layout", values=dict(rcontext, subst=True,
                                              body=markupsafe.Markup(
                                                  footer.decode())))
        landscape = False
        if len(print_options['columns']) > 5 or self._context.get(
                'force_landscape_printing'):
            landscape = True
        file_content = self.env['ir.actions.report']._run_wkhtmltopdf(
            [body],
            footer=footer.decode(),
            landscape=landscape,
            specific_paperformat_args={
                'data-report-margin-top': 10,
                'data-report-header-spacing': 10,
                'data-report-margin-bottom': 15,
            }
        )
        return {
            'file_name': self.get_default_report_filename('pdf'),
            'file_content': file_content,
            'file_type': 'pdf',
        }

    def _get_lines(self, options, line_id=None):
        lines = super()._get_lines(options, line_id)
        if self._context.get('export_to_pdf2'):
            for line in list(lines):
                if line.get('name') == _('Initial Balance'):
                    line['name'] = _('Previous Balance')
                    if line.get('class') == 'o_account_reports_initial_balance':
                        line['columns'][5]['no_format'] = 0.0
                        line['columns'][5]['name'] = ''
                        line['columns'][6]['no_format'] = 0.0
                        line['columns'][6]['name'] = ''
                        col_val = line['columns'][8].get('no_format', 0.0)
                        col_fmt = line['columns'][8].get('name', '')

                        if col_val < 0:
                            line['columns'][6]['no_format'] = abs(col_val)
                            line['columns'][6]['name'] = col_fmt.replace('-',
                                                                         '').strip()
                        elif col_val > 0:
                            line['columns'][5]['no_format'] = col_val
                            line['columns'][5]['name'] = col_fmt.strip()
                elif self.env['res.partner'].search(
                        [('name', '=', line.get('name'))]):
                    lines.remove(line)
        return lines
