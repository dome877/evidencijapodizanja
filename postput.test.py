import requests
import json

# Your API Gateway endpoint
api_url = "https://xg77afez86.execute-api.eu-north-1.amazonaws.com/prod/update"

# Replace with your actual token
token = "eyJraWQiOiJhNkZhNHVPSHRzSXpDVzlJR0lhXC9CY1htT0dGMUtLcDZcLzhqTDNsVVFGTWM9IiwiYWxnIjoiUlMyNTYifQ.eyJzdWIiOiI1MGRjZTk3Yy1mMDYxLTcwMzEtODU0NC1mMGMwZmE4ZjdhNjEiLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAuZXUtbm9ydGgtMS5hbWF6b25hd3MuY29tXC9ldS1ub3J0aC0xX2JBRDRLSUwySCIsInZlcnNpb24iOjIsImNsaWVudF9pZCI6InN1Zm5tbW1sNzU0anU2bTZlbjJjZXJyNHQiLCJvcmlnaW5fanRpIjoiMmM0MzZjNjYtNGRmYS00MTE4LTg1NmEtNDdkZTgyMTFkMzMzIiwiZXZlbnRfaWQiOiI4NjNkZmY2Yy03MTljLTQzOTUtYTdmZi02Zjc5OTcxMGNmZTIiLCJ0b2tlbl91c2UiOiJhY2Nlc3MiLCJzY29wZSI6InBob25lIG9wZW5pZCBlbWFpbCIsImF1dGhfdGltZSI6MTc0MjY2MDQyOCwiZXhwIjoxNzQyNjY0MDI4LCJpYXQiOjE3NDI2NjA0MjgsImp0aSI6IjhjZGZlMWI4LTAwZWMtNDhmYS1hZTdjLTA5NWQ3ZTAzMGIyZSIsInVzZXJuYW1lIjoiNTBkY2U5N2MtZjA2MS03MDMxLTg1NDQtZjBjMGZhOGY3YTYxIn0.hKuaKAqWvIJHqpGP9vNOXveZhYsFSfuniIq6aVYquzFHh36vDWPjJih9zMMVRPMlAwuyAP_6p7GpOD0ugAau1uItVjPk1IBL-DgpakGhzuvg_tmjFgriTdLYg7x2jWoL7WBvkdIPh1QTlLRpFggPTobTjJYbH7qDxaeT91KC2t1zOxR-WJYRfOJndSukQopvhGqd0iZ7c7ivShnrb132GtwNSFRB0pMVeboSdJ5lSikYXhn6QKitpPKZ6wtmnhemGUevKAJOVkhAIHAli8kU2sAhedBUL4DEtuKglOhBuUz4BO5W13r-qaqTfeidHe3HrZbduz2pJIT_FHb6G1QXyA"

# Headers
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}

# Payload data
payload = {
    "_id": "67de9acdf9be4027c119b453",
    "date": "21.3.2025",
    "deviceName": "Ručni Čitač 40199",
    "napomena": "3. smjena",
    "reg_oznaka": "ŠI-968-JM",
    "zadužio": "Ljubić"
}

print(f"Sending POST request to {api_url}")
print(f"Headers: {json.dumps(headers, indent=2)}")
print(f"Payload: {json.dumps(payload, indent=2, ensure_ascii=False)}")

# Send the POST request
try:
    response = requests.put(
        url=api_url,
        headers=headers,
        json=payload
    )
    
    print(f"\nResponse status code: {response.status_code}")
    
    # Check if request was successful
    if response.status_code in (200, 201, 202):
        # Print the response data
        print("Request successful!")
        
        # Try to parse response as JSON
        try:
            response_data = response.json()
            print("\nResponse data:")
            print(json.dumps(response_data, indent=2, ensure_ascii=False))
            
            # Save full response to a file
            with open("api_response.json", "w", encoding="utf-8") as file:
                json.dump(response_data, file, indent=2, ensure_ascii=False)
            print("Full response saved to api_response.json")
            
        except json.JSONDecodeError:
            print("Response is not JSON format:")
            print(response.text)
    else:
        print(f"Request failed with status code: {response.status_code}")
        print(f"Response: {response.text}")

except Exception as e:
    print(f"An error occurred: {e}")
