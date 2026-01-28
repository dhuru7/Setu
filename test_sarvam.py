
try:
    from sarvamai import SarvamAI
    print("SarvamAI imported successfully")
except ImportError:
    print("SarvamAI not installed")
    exit(1)

client = SarvamAI(api_subscription_key="sk_41b4repc_2IRSgt6yVmBW0cdQV4yPKyyc")

try:
    # Attempt call without model as requested
    response = client.chat.completions(
        messages=[
            {"role": "user", "content": "Hello"}
        ]
    )
    print("Response received:")
    print(response)
except Exception as e:
    print(f"Error calling API: {e}")
