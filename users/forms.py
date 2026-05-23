from django import forms
from django.contrib.auth.forms import UserCreationForm
from django.contrib.auth.validators import UnicodeUsernameValidator

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

    def clean_username(self):
        username = (self.cleaned_data.get("username") or "").strip()
        if not username:
            return username

        validator = UnicodeUsernameValidator()
        try:
            validator(username)
        except forms.ValidationError:
            raise forms.ValidationError(
                "Le nom d’utilisateur ne peut contenir que des lettres, des chiffres et certains caractères simples."
            )

        duplicate = CustomUser.objects.filter(username__iexact=username)
        if self.instance and self.instance.pk:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if duplicate.exists():
            raise forms.ValidationError("Ce nom d’utilisateur est déjà pris.")
        return username

    def clean_email(self):
        email = (self.cleaned_data.get("email") or "").strip()
        if not email:
            return email

        duplicate = CustomUser.objects.filter(email__iexact=email)
        if self.instance and self.instance.pk:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if duplicate.exists():
            raise forms.ValidationError("Cette adresse email est déjà utilisée.")
        # TODO: Ajouter une contrainte DB d’unicité insensible à la casse après nettoyage des doublons historiques.
        return email
