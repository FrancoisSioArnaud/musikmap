import json


try:
    with open("credential.json") as json_data_file:
        data = json.load(json_data_file)


        CLIENT_ID = data['Credentials'][0]['client_id']
        CLIENT_SECRET = data['Credentials'][0]['client_secret']
        REDIRECT_URI = data['Credentials'][0]['redirect_uri']

except FileNotFoundError as fnfe:
    print("'credential.json' not found. (in spotify/credential.py)")
    exit()

except json.JSONDecodeError:
    print("'credential.json' is invalid or empty. (in spotify/credential.py)")

    exit()







