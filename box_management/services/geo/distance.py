from math import atan2, cos, radians, sin, sqrt


def _calculate_distance(lat1, lon1, lat2, lon2) -> float:
    lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])
    r = 6371000

    d_lat = lat2 - lat1
    d_lon = lon2 - lon1

    a = sin(d_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(d_lon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    return r * c


__all__ = ["_calculate_distance"]
