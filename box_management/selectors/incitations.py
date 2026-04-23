from box_management.models import IncitationPhrase


def get_client_phrases(user):
    return list(IncitationPhrase.objects.visible_for_client_user(user).select_related("client"))


def get_client_phrase_by_id(user, incitation_id):
    return (
        IncitationPhrase.objects.visible_for_client_user(user).select_related("client").filter(id=incitation_id).first()
    )
