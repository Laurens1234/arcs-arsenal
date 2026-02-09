import base64

# The tierlist parameter from the URL
encoded = 'V1hWdHwzOjM5NzM3NzQwNzQzNzI4NzI5NzM2NzM0NzMxNzM1NzMzNzQyNzM4NzQxNzMyNzMwMA'

# Add padding if needed
padded = encoded + '=' * (4 - len(encoded) % 4)

try:
    decoded = base64.b64decode(padded).decode('utf-8')
    print('Decoded data:', repr(decoded))

    # Split by | to see the parts
    parts = decoded.split('|')
    print('Number of parts:', len(parts))
    print('Parts:', parts)

    for i, part in enumerate(parts):
        if i % 2 == 0:
            # Even indices should be base64 encoded names
            try:
                name_padded = part + '=' * (4 - len(part) % 4)
                name = base64.b64decode(name_padded).decode('utf-8')
                print(f'Part {i} (name): "{name}"')
            except Exception as e:
                print(f'Part {i} (could not decode as name): "{part}" - Error: {e}')
        else:
            # Odd indices should be Section:entries
            print(f'Part {i} (section:data): "{part}"')

except Exception as e:
    print('Error decoding:', e)