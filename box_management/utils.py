"""Compatibility shim for legacy imports.

All implementations moved to ``box_management.domain.legacy_utils``.
"""

from box_management.domain import legacy_utils as _legacy_utils

_EXPORTED_NAMES = [name for name in vars(_legacy_utils) if not (name.startswith("__") and name.endswith("__"))]

globals().update({name: getattr(_legacy_utils, name) for name in _EXPORTED_NAMES})

__all__ = _EXPORTED_NAMES
