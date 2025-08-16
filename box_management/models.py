from django.db import models
from django.utils import timezone
from django.utils.text import slugify
from django.core.validators import MinValueValidator, MaxValueValidator
from users.models import CustomUser
from django.core.exceptions import ValidationError
from django.utils.translation import gettext_lazy as _


class Box(models.Model):
    """
    Class goal: This class represents a Music Box.

    Attributes:
        name        : The name of the box.
        description : The description of the box.
        url         : The URL of the box.
        image_url   : The URL of the image of the box.
        created_at  : The date of creation of the box.
        updated_at  : The date of the last update of the box.
        client_name : The name of the client.
        max_deposits: The maximum number of deposits allowed in the box.
    """

    name = models.CharField(max_length=50, unique=True)
    description = models.CharField(max_length=150, blank=True)
    url = models.SlugField(blank=True)
    image_url = models.URLField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    client_name = models.CharField(max_length=50)
    max_deposits = models.IntegerField(default=5)

    def __str__(self):
        """
        Method goal: Returns the name of the box used to display it in the admin interface.
        """
        return self.name

    def save(self, *args, **kwargs):
        # If url is empty, construct it based on the app's base URL and box name
        if not self.url:
            self.url = self.name
        super().save(*args, **kwargs)


def validate_spotify_or_deezer_id(value):
    if not value['spotify_id'] and not value['deezer_id']:
        raise ValidationError(
            _('At least one of Spotify ID or Deezer ID must be present.'),
            params={'value': value},
        )

class Song(models.Model):
    """
    Class goal: This class represents a song.

    Attributes:
        title     : The title of the song.
        artist    : The artist of the song.
        url       : The URL of the song.
        image_url : The URL of the image of the song.
        duration  : The duration of the song.
        platform_id: The id of the platform on which the song is available.
        n_deposits: The number of deposits of the song.
        spotify_id: The Spotify ID of the song.
        deezer_id : The Deezer ID of the song.
    """

    title = models.CharField(max_length=50)
    artist = models.CharField(max_length=50)
    url = models.URLField(max_length=200)
    image_url = models.URLField(max_length=200, blank=True)
    duration = models.IntegerField(default=0)  # Duration in seconds
    platform_id = models.IntegerField(default=0)
    spotify_id = models.CharField(max_length=50, blank=True, null=True, validators=[validate_spotify_or_deezer_id])
    deezer_id = models.CharField(max_length=50, blank=True, null=True, validators=[validate_spotify_or_deezer_id])

    def __str__(self):
        """
        Method goal: Returns the title and the artist of the song used to display it in the admin interface.
        """
        return self.title + " - " + self.artist

    @property
    def n_deposits(self):
        return self.deposits.count()


class Deposit(models.Model):
    NOTE_CHOICES = [
        ("donnesourire", "Cette chanson me donne toujours le sourire"),
        ("momentdejoie", "Cette chanson rappelle des moments de joie"),
        ("souvenirfetes", "Cette chanson évoque des souvenirs de fêtes"),
        ("faitdanser", "Cette chanson me fait toujours danser"),
        ("remplitbonheur", "Cette chanson me remplit de bonheur instantanément"),
        ("remedejoursgris", "Cette chanson est mon remède contre les jours gris"),
        ("joursheureuxenfance", "Cette chanson rappelle les jours heureux de mon enfance"),
        ("explosionjoie", "Cette chanson est une explosion de joie"),
        ("accompagnenostalgie", "Cette chanson m'accompagne quand je suis nostalgique"),
        ("pleurerchaquefois", "Cette chanson me fait pleurer à chaque fois"),
        ("nuitsdete", "Cette chanson rappelle les nuits d'été sous les étoiles"),
        ("momentspasses", "Cette chanson me fait revivre les moments passés"),
        ("doucemelancolie", "Cette chanson évoque une douce mélancolie"),
        ("pleinenostalgie", "Cette chanson est pleine de nostalgie"),
        ("espoirsjeunesse", "Cette chanson rappelle les rêves et espoirs de ma jeunesse"),
        ("periodedifficile", "Cette chanson a été ma bande-son pendant une période difficile"),
        ("traverserrupture", "Cette chanson m'a aidé à traverser une rupture"),
        ("ecouteaulycee", "Cette chanson, je l'écoutais en boucle au lycée"),
        ("defissurmontes", "Cette chanson rappelle les défis que j'ai surmontés"),
        ("momentcle", "Cette chanson est liée à un moment clé de ma vie"),
        ("reussitesexamens", "Cette chanson rappelle des examens et réussites"),
        ("tournantcarriere", "Cette chanson a marqué un tournant dans ma carrière"),
        ("momentscruciaux", "Cette chanson était là lors des moments cruciaux"),
        ("ecoleprimaire", "Cette chanson me rappelle mes jours d'école primaire"),
        ("souvenircollege", "Cette chanson évoque les souvenirs du collège"),
        ("souvenirlycee", "Cette chanson était un hit pendant mes années de lycée"),
        ("souveniruniversité", "Cette chanson me rappelle mes années à l'université"),
        ("naissanceenfant", "Cette chanson est spéciale car je l'écoutais à la naissance de mon enfant"),
        ("nuitsblanchesenfant", "Cette chanson me rappelle les nuits blanches en tant que jeune parent"),
        ("premieremploi", "Cette chanson me ramène à mon premier emploi"),
        ("souvenirmariage", "Cette chanson évoque le jour de mon mariage"),
        ("anneesdorees", "Cette chanson m'accompagne dans mes années dorées"),
        ("souveniramies", "Cette chanson me fait penser à mes ami·e·s"),
        ("souvenirparents", "Cette chanson me fait penser à mes parents"),
        ("souvenirgrandsparents", "Cette chanson me fait penser à mes grands-parents"),
        ("souvenirfreresoeur", "Cette chanson me fait penser à mon·mes frère/ma·mes sœurs"),
        ("souvenircousin", "Cette chanson me fait penser à mon·ma·mes mes cousin·e·s"),
        ("souvenirenfants", "Cette chanson me fait penser à mes enfants"),
        ("souvenircollegues", "Cette chanson me fait penser à mon·ma·mes collègue·s"),
        ("souveniramisenfance", "Cette chanson me fait penser à mes vieux amis d'enfance"),
        ("meilleuresvacances", "Cette chanson me rappelle les meilleures vacances"),
        ("eteplage", "Cette chanson m’évoque les étés à la plage"),
        ("souvenirenfance", "Cette chanson rappelle mon enfance"),
        ("roadtripinoubliable", "Cette chanson, je l’ai découverte pendant un road trip inoubliable"),
        ("couchersoleilplage", "Cette chanson me fait penser aux couchers de soleil sur la plage"),
        ("bandesonexploration", "Cette chanson était la bande-son de nos explorations"),
        ("hymneliberte", "Cette chanson est un hymne à la liberté"),
        ("evasion", "Cette chanson m'aide à m'évader"),
        ("accompagnevoyage", "Cette chanson m'a accompagné en voyage"),
        ("voler", "Cette chanson me fait sentir comme si je volais"),
        ("souvenirsfete", "Cette chanson rappelle des fêtes inoubliables"),
        ("invitationaventure", "Cette chanson est une invitation à l'aventure"),
        ("paysagemagnifiques", "Cette chanson rappelle des paysages magnifiques"),
        ("voyagelointain", "Cette chanson, est un voyage lointain"),
        ("motivation", "Cette chanson me motive quand j'en ai besoin"),
        ("dansesansretenue", "Cette chanson me donne envie de danser sans retenue"),
        ("sentirpuissance", "Cette chanson me fait me sentir puissant"),
        ("boost", "Cette chanson me booste quand il le faut"),
        ("trouverenergie", "Cette chanson m'aide à trouver de l'énergie"),
        ("inspirationautop", "Cette chanson m'inspire à être au top"),
        ("crideguerre", "Cette chanson est mon cri de guerre avant un défi"),
        ("toutaccomplir", "Cette chanson me rappelle que je peux tout accomplir"),
        ("briserchaines", "Cette chanson m'inspire à briser toutes les chaînes"),
        ("rienimpossible", "Cette chanson me fait sentir que rien n'est impossible"),
        ("donneespoir", "Cette chanson, les paroles me donnent de l'espoir"),
        ("donnefrissons", "Cette chanson me donne des frissons à chaque écoute"),
        ("transporteailleurs", "Cette chanson me transporte instantanément ailleurs"),
        ("parolesresonne", "Cette chanson, les paroles résonnent en moi"),
        ("inspiremeilleur", "Cette chanson m'inspire à être meilleur"),
        ("toujoursespoir", "Cette chanson rappelle qu'il y a toujours de l'espoir"),
        ("paroletoucher", "Cette chanson, les paroles me touchent profondément"),
        ("pourreflexion", "Cette chanson est parfaite pour la réflexion"),
        ("pourmediter", "Cette chanson est idéale pour méditer"),
        ("momentcalme", "Cette chanson est toujours là pour mes moments de calme"),
        ("pourrecentrer", "Cette chanson m'apaise et me recentre"),
        ("sereniteinterieur", "Cette chanson m'aide à trouver la sérénité intérieure"),
        ("pourcontemplation", "Cette chanson est idéale pour la contemplation"),
        ("accompagnesolitude", "Cette chanson m'accompagne dans la solitude"),
        ("reflechir", "Cette chanson est mon refuge pour réfléchir"),
        ("promenadetranquille", "Cette chanson est parfaite pour une promenade tranquille"),
        ("joursdepluie", "Cette chanson est idéale pour les jours de pluie"),
        ("pouryoga", "Cette chanson m'accompagne lors de mes séances de yoga"),
        ("bainrelaxant", "Cette chanson est parfaite pour un bain relaxant"),
        ("endormirpaisiblement", "Cette chanson est idéale pour s'endormir paisiblement"),
        ("longuejournee", "Cette chanson m'aide à me détendre après une longue journée"),
        ("lecturetranquille", "Cette chanson m'accompagne pendant mes lectures tranquilles"),
        ("pausedetentenature", "Cette chanson est idéale pour une pause détente en pleine nature"),
        ("regarderetoiles", "Cette chanson est parfaite pour écouter en regardant les étoiles"),
    ]

    song = models.ForeignKey(Song, on_delete=models.CASCADE, related_name='deposits')
    box = models.ForeignKey(Box, on_delete=models.CASCADE)
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE, null=True)
    is_visible = models.BooleanField(default=False)
    note = models.CharField(max_length=50, choices=NOTE_CHOICES, blank=True, null=True)
    deposited_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.song} - {self.box}"


class LocationPoint(models.Model):
    """
    Class goal: This class represents a location point.

    Attributes:
        box_id       : The id of the box.
        latitude     : The latitude of the location point.
        longitude    : The longitude of the location point.
        dist_location: The maximum distance between the user and the location point.
    """

    box = models.ForeignKey(Box, on_delete=models.CASCADE)
    latitude = models.FloatField(
        validators=[MinValueValidator(-90), MaxValueValidator(90)], blank=False
    )
    longitude = models.FloatField(
        validators=[MinValueValidator(-180), MaxValueValidator(180)], blank=False
    )
    dist_location = models.IntegerField(default=100)

    def __str__(self):
        """
        Method goal: Returns the name of the box, the latitude and the longitude of the location point
        used to display it in the admin interface.
        """
        return f"{self.box.name} - {self.latitude} - {self.longitude}"


class VisibleDeposit(models.Model):
    """
    Class goal: This class represents a visible deposit, i.e. a deposit that is visible by the user in a box.

    Attributes:
        deposit_id: The id of the deposit.
    """

    deposit_id = models.ForeignKey(Deposit, on_delete=models.CASCADE)

    def __str__(self):
        return str(self.id) + "-" + str(self.deposit_id)


class DiscoveredSong(models.Model):
    """
    Class goal: This class represents a discovered song.

    Attributes:
        song_id   : The id of the song.
        user_id   : The id of the user.
    """

    deposit = models.ForeignKey(Deposit, on_delete=models.CASCADE)
    user = models.ForeignKey(CustomUser, on_delete=models.CASCADE)

    def __str__(self):
        """
        Method goal: Returns the id of the user and the id of the deposit used to display it in the admin interface.
        """
        return str(self.user) + " - " + str(self.deposit)

class Cardboard(models.Model):
    """
    Class goal: This class represents a Cardboard linked to a Box.
    
    Attributes:
        box       : Foreign key to the associated Box.
        unique_url: A unique URL slug for the Cardboard.
    """
    box = models.ForeignKey(Box, on_delete=models.CASCADE)
    unique_url = models.SlugField(unique=True)

    def __str__(self):
        """
        Method goal: Returns the unique URL of the cardboard used to display it in the admin interface.
        """
        return f"Cardboard for {self.box.name} with URL {self.unique_url}"

    def get_absolute_url(self):
        """
        Method goal: Returns the absolute URL for the cardboard.
        """
        return reverse('cardboard_redirect', kwargs={'unique_url': self.unique_url})
