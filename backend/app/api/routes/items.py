from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from app.db import get_session
from app.models import Item, ItemCreate, ItemRead


router = APIRouter(prefix="/items", tags=["items"])
SessionDep = Annotated[Session, Depends(get_session)]


@router.post("", response_model=ItemRead, status_code=201)
def create_item(item: ItemCreate, session: SessionDep) -> Item:
    db_item = Item.model_validate(item)
    session.add(db_item)
    session.commit()
    session.refresh(db_item)
    return db_item


@router.get("", response_model=list[ItemRead])
def read_items(
    session: SessionDep,
    offset: int = 0,
    limit: Annotated[int, Query(le=100)] = 100,
) -> list[Item]:
    return list(session.exec(select(Item).offset(offset).limit(limit)).all())


@router.get("/{item_id}", response_model=ItemRead)
def read_item(item_id: int, session: SessionDep) -> Item:
    item = session.get(Item, item_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Item not found")
    return item

