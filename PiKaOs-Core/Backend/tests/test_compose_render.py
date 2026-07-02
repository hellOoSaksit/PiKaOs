from app.core.compose_render import merge_fragments


def test_merge_adds_tool_service():
    base = {"services": {"backend": {"image": "core"}}, "volumes": {}}
    frag = {"services": {"db": {"image": "pgvector/pgvector:pg16"}},
            "volumes": {"pgdata": None}}
    out = merge_fragments(base, [frag])
    assert "backend" in out["services"]
    assert out["services"]["db"]["image"] == "pgvector/pgvector:pg16"
    assert "pgdata" in out["volumes"]


def test_merge_is_pure():
    base = {"services": {"backend": {}}, "volumes": {}}
    merge_fragments(base, [{"services": {"db": {}}, "volumes": {}}])
    assert "db" not in base["services"]  # input not mutated


def test_merge_unions_networks():
    base = {"services": {}, "networks": {"a": None}}
    out = merge_fragments(base, [{"networks": {"b": None}}])
    assert set(out["networks"]) == {"a", "b"}
