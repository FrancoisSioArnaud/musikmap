class DiscoveredSong(models.Model):
    """
    Représente un dépôt découvert par un utilisateur.
    - discovered_type : "main" (gros bloc) ou "revealed" (dépôt révélé)
    - Un dépôt ne peut être découvert qu'une seule fois par un même utilisateur.
    """
    deposit_id = models.ForeignKey('box_management.Deposit', on_delete=models.CASCADE)
    user_id = models.ForeignKey(CustomUser, on_delete=models.CASCADE)

    DISCOVERED_TYPES = (
        ("main", "Main"),
        ("revealed", "Revealed"),
    )
    discovered_type = models.CharField(max_length=8, choices=DISCOVERED_TYPES, default="revealed")

    discovered_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['user_id', 'deposit_id'], name='unique_discovery_per_user_and_deposit'),
        ]

    def __str__(self):
        return f"{self.user_id} - {self.deposit_id}"
