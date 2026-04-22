from django import forms
from django.contrib.auth.forms import UserCreationForm

from .models import CustomUser


class RegisterUserForm(UserCreationForm):
    email = forms.EmailField(widget=forms.EmailInput(attrs={"class": "form-control"}))
    # first_name = forms.CharField(max_length=50, widget=forms.TextInput(attrs={'class': 'form-control'}))
    # last_name = forms.CharField(max_length=50, widget=forms.TextInput(attrs={'class': 'form-control'}))
    profile_picture = forms.ImageField(required=False, widget=forms.FileInput(attrs={"class": "form-control"}))

    class Meta:
        model = CustomUser
        # fields = ('username', 'first_name', 'last_name', 'email', 'password1', 'password2', 'profile_picture')
        fields = ("username", "email", "password1", "password2", "profile_picture")

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)

        self.fields["username"].widget.attrs["class"] = "form-control"
        self.fields["password1"].widget.attrs["class"] = "form-control"
        self.fields["password2"].widget.attrs["class"] = "form-control"
