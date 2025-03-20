import requests
import json

# Your API Gateway endpoint
api_url = "https://xg77afez86.execute-api.eu-north-1.amazonaws.com/prod/evidencija"

# Replace with your actual Cognito token
token = "eyJraWQiOiJHVjNcL1RQMUxlYWdMZkFRaVdjYXVsZTNMM1V4XC8xRUMxZFFyXC91ZnM0V3M0PSIsImFsZyI6IlJTMjU2In0.eyJhdF9oYXNoIjoiQkVUS2tQX29RQVV2bFk2T2xfcjNfQSIsInN1YiI6IjUwZGNlOTdjLWYwNjEtNzAzMS04NTQ0LWYwYzBmYThmN2E2MSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJpc3MiOiJodHRwczpcL1wvY29nbml0by1pZHAuZXUtbm9ydGgtMS5hbWF6b25hd3MuY29tXC9ldS1ub3J0aC0xX2JBRDRLSUwySCIsImNvZ25pdG86dXNlcm5hbWUiOiI1MGRjZTk3Yy1mMDYxLTcwMzEtODU0NC1mMGMwZmE4ZjdhNjEiLCJvcmlnaW5fanRpIjoiZjA2MzhiNzctMWYzNy00Y2Y4LThiOGItMzQ4ZDIxYjhhN2E3IiwiYXVkIjoic3Vmbm1tbWw3NTRqdTZtNmVuMmNlcnI0dCIsInRva2VuX3VzZSI6ImlkIiwiYXV0aF90aW1lIjoxNzQyNTAzMjI4LCJleHAiOjE3NDI1MDY4MjgsImlhdCI6MTc0MjUwMzIyOCwianRpIjoiZmQ3MzI1NTEtYmM2Mi00NTlmLWIzODQtMmE1MDBlNTdlNTc3IiwiZW1haWwiOiJkb21hZ29qLmxqdWJpY0B6ZWxlbmktZ3JhZC5ociJ9.tMVmEK3b7TgbPl87sLK8nStSvfiRucVf-hk1TGC4peCcwMLD9pqxHeFnk_A8F5YHc4ut9e99d5Zm4KsJ8b-9ME3l1Gn-Go8Vge_d5aF4Uq4QJ-Wiosa3BCY8BALdq6AIwAi8LmM_YWLzJtOpTDF7kAmcWkNdtbzUTARRRDIPL4OeAz3_mfarOG4T8Ko09yxXJgwXsLP0mw47yYf6UusZ-EyzSrZos2T6kmmKUv8xMOhP_mFYvPFebXih8MCtZlh2O8GR-YFmEaEskRD2O50K7pwM9igI9i2sKgDexT9azmx9Vl372O2izPaXw_cHyynq8RdB6A-BxIDU-Ryyiw5coA"

# Headers
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}

# Query parameters
params = {
    "dateFrom": "2025-03-20",
    "dateTo": "2025-03-20"
}

# Send the GET request
try:
    response = requests.get(
        url=api_url,
        headers=headers,
        params=params
    )
    
    # Check if request was successful
    if response.status_code == 200:
        # Print the response data
        response_data = response.json()
        print("Request successful!")
        print(f"Status code: {response.status_code}")
        print(f"Records returned: {len(response_data.get('root', []))}")
        
        # Save full response to a file
        with open("api_response.json", "w") as file:
            json.dump(response_data, file, indent=2)
        print("Full response saved to api_response.json")
        
        # Print first item as sample (if exists)
        if response_data.get('root') and len(response_data['root']) > 0:
            print("\nSample data (first record):")
            print(json.dumps(response_data['root'][0], indent=2))
    else:
        print(f"Request failed with status code: {response.status_code}")
        print(f"Response: {response.text}")

except Exception as e:
    print(f"An error occurred: {e}")
