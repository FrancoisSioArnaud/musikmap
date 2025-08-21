from django.urls import path, include
from .views import ApiAggregation

urlpatterns = [
    path('aggreg', ApiAggregation.as_view(), name='aggreg') 
]

