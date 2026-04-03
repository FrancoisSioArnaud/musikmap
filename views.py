from django.shortcuts import render

# Create your views here.


def index(request, *args, **kwargs):
    return render(request, 'frontend/index.html')

# Takes the request and the template (index.html and return the HTML to the client)



