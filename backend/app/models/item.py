from sqlmodel import Field, SQLModel


class ItemBase(SQLModel):
    name: str = Field(index=True, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=500)


class Item(ItemBase, table=True):
    id: int | None = Field(default=None, primary_key=True)


class ItemCreate(ItemBase):
    pass


class ItemRead(ItemBase):
    id: int

