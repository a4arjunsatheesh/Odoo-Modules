from lxml import etree

from odoo import api, models


class IrUiView(models.Model):
    _inherit = "ir.ui.view"

    @api.model
    def studio_apply_label_updates(self, view_id, view_type, updates):
        if not view_id:
            return False
        if view_type not in {"form", "list"}:
            return False
        if not updates:
            return False

        view = self.browse(view_id).exists()
        if not view:
            return False

        view.check_access_rights("write")
        view.check_access_rule("write")

        root_view = view
        while root_view.inherit_id:
            root_view = root_view.inherit_id

        candidate_views = root_view._get_inheriting_views()
        changed_views = self.browse()

        for candidate_view in candidate_views:
            arch = etree.fromstring(candidate_view.arch_db.encode("utf-8"))
            view_changed = False
            for field_name, label in updates.items():
                if not field_name or label is None:
                    continue
                field_nodes = arch.xpath(".//field[@name=$field_name]", field_name=field_name)
                for node in field_nodes:
                    node.set("string", label)
                    view_changed = True
            if view_changed:
                candidate_view.write({"arch_db": etree.tostring(arch, encoding="unicode")})
                changed_views |= candidate_view

        if not changed_views:
            return False

        self.env.registry.clear_cache()
        self.env["ir.qweb"].clear_caches()
        return True
