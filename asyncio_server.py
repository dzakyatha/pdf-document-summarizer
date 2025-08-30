import asyncio, websockets, json, redis.asyncio as redis

# Variabel untuk menyimpan koneksi yang aktif
# Format: {'group_name': websocket_connection}
CONNECTED_CLIENTS = {}

# Channel Redis
REDIS_CHANNEL = "upload_notifications"

# inisialisasi Redis connection
redis_client = redis.Redis(
        host='localhost',
        port=6379, # port TCP Redis,
        db=0,
        decode_responses=True
    )

# fungsi untuk listener dari Redis
async def listener():
    async with redis_client.pubsub() as pubsub:
        await pubsub.subscribe(REDIS_CHANNEL)
        
        while True:
            try:
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                
                if message: # kalau pesan telah diterima
                    print(f"Pesan diterima dari Redis {message['data']}")
                    data = json.loads(message['data'])
                    group_name = data.get('group_name')

                    # Mencari koneksi WebSocket yang sesuai
                    websocket = CONNECTED_CLIENTS.get(group_name)
                    if websocket:
                        print(f"Meneruskan pesan ke browser dengan grup: {group_name}")
                        await websocket.send(json.dumps({'message': data['payload']}))
            
            except Exception as e:
                print(f"Error dari listener: {e}")

# fungsi untuk menangani setiap koneksi WebSocket
async def handler(websocket):
    path = websocket.path
    group_name = path.strip('/')
    CONNECTED_CLIENTS[group_name] = websocket
    print(f"{group_name} connected")
    print(f"Total client: {len(CONNECTED_CLIENTS)}")

    try:
        # koneksi terbuka terus-menerus
        async for message in websocket:
            pass
    finally:
        # menghapus koneksi saat browser ditutup
        del CONNECTED_CLIENTS[group_name]
        print(f"{group_name} disconnected")
        print(f"Total client: {len(CONNECTED_CLIENTS)}")


# fungsi utama untuk menjalankan kedua task (server & listener)
async def main():
    print("Memulai server websocket di port 9000")

    # listener Redis
    listener_task = asyncio.create_task(listener())

    # server WebSocket
    async with websockets.serve(handler, "localhost", 9000):
        await listener_task

if __name__ == "__main__":
    asyncio.run(main())