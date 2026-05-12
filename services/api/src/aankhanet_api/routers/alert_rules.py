from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, HTTPException, status

from aankhanet_api import database as db
from aankhanet_api.deps import require_permission
from aankhanet_api.repositories import alert_rules as ar_repo
from aankhanet_api.schemas.alert_rules import AlertRuleCreate, AlertRuleOut, AlertRuleUpdate

router = APIRouter(prefix="/alert-rules", tags=["alert-rules"])

_ReadRules  = Annotated[dict[str, Any], require_permission("alert_rules:read")]
_WriteRules = Annotated[dict[str, Any], require_permission("alert_rules:write")]


@router.get("", response_model=list[AlertRuleOut], response_model_by_alias=True)
async def list_alert_rules(current_user: _ReadRules) -> list[AlertRuleOut]:
    async with db.get_connection() as conn:
        rules = await ar_repo.list_alert_rules(conn, current_user["org"])
    return [AlertRuleOut(**r) for r in rules]


@router.post("", status_code=status.HTTP_201_CREATED, response_model=AlertRuleOut, response_model_by_alias=True)
async def create_alert_rule(body: AlertRuleCreate, current_user: _WriteRules) -> AlertRuleOut:
    async with db.get_connection() as conn:
        rule = await ar_repo.create_alert_rule(
            conn, current_user["org"], body.name, body.min_severity,
            body.channel, body.mitre_filter, body.target_user_id, body.enabled,
        )
    return AlertRuleOut(**rule)


@router.patch("/{rule_id}", response_model=AlertRuleOut, response_model_by_alias=True)
async def patch_alert_rule(rule_id: str, body: AlertRuleUpdate, current_user: _WriteRules) -> AlertRuleOut:
    async with db.get_connection() as conn:
        rule = await ar_repo.patch_alert_rule(
            conn, current_user["org"], rule_id, **body.model_dump(exclude_none=True)
        )
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    return AlertRuleOut(**rule)


@router.delete("/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_alert_rule(rule_id: str, current_user: _WriteRules) -> None:
    async with db.get_connection() as conn:
        deleted = await ar_repo.delete_alert_rule(conn, current_user["org"], rule_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
