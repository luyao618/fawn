from fawn.agent.tools.advisor import search_knowledge
from fawn.agent.tools.album import browse_photos
from fawn.agent.tools.profile import update_user_profile
from fawn.agent.tools.tracker import (
    delete_tracker_record,
    get_baby_profile,
    query_feeding_data,
    query_growth_data,
    query_health_timeline,
    query_sleep_data,
    record_feeding,
    record_growth,
    record_health,
    record_sleep,
    update_tracker_record,
)

TOOLS = [
    record_growth,
    record_feeding,
    record_sleep,
    record_health,
    update_tracker_record,
    delete_tracker_record,
    query_growth_data,
    query_feeding_data,
    query_sleep_data,
    query_health_timeline,
    search_knowledge,
    get_baby_profile,
    browse_photos,
    update_user_profile,
]

__all__ = ["TOOLS"]
