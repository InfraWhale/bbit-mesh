const mediaStreamConstraints = {
    video: true,
    audio: true
};

const offerOptions = {
    offerToReceiveVideo: 1,
};

const localVideo = document.getElementById('localVideo');
let localStream;
let localUserId;
let connections = [];

// ICE 서버 설정 추가 (STUN/TURN 서버)
const iceServers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }, // STUN 서버
        // {
        //     urls: 'turn:your-turn-server.com:3478', // TURN 서버
        //     username: 'your-username',
        //     credential: 'your-password'
        // }
    ]
};

function gotRemoteStream(event, userId) {
    let remoteVideo = document.createElement('video');
    remoteVideo.setAttribute('data-socket', userId);
    //remoteVideo.srcObject = event.stream;
    remoteVideo.srcObject = event.streams[0]; // ontrack 이벤트에서 첫 번째 스트림 사용
    remoteVideo.autoplay = true;
    // remoteVideo.muted = true;
    remoteVideo.playsinline = true;
    document.querySelector('.videos').appendChild(remoteVideo);
}

function gotIceCandidate(fromId, candidate) {
    connections[fromId].addIceCandidate(new RTCIceCandidate(candidate)).catch(handleError);
}

// function startLocalStream() {
//     navigator.mediaDevices.getUserMedia(mediaStreamConstraints)
//         .then(getUserMediaSuccess)
//         .then(connectSocketToSignaling)
//         .catch(handleError);
// }

function startLocalStream() {
    console.log('Requesting media devices...');
    navigator.mediaDevices.getUserMedia(mediaStreamConstraints)
        .then((mediaStream) => {
            console.log('MediaStream acquired:', mediaStream);
            console.log('Audio tracks:', mediaStream.getAudioTracks());
            console.log('Video tracks:', mediaStream.getVideoTracks());
            getUserMediaSuccess(mediaStream);
            connectSocketToSignaling();
        })
        .catch((error) => {
            console.error('Error accessing media devices:', error);
            alert('Unable to access camera/microphone. Please check your browser settings.');
        });
}

function connectSocketToSignaling() {
    const socket = io.connect('https://studybbit.store:3001', { secure: true });

    socket.on('connect', () => {
        localUserId = socket.id;
        console.log('localUser', localUserId);

        socket.on('user-joined', (data) => {
            const clients = data.clients;
            const joinedUserId = data.joinedUserId;
            console.log(joinedUserId, ' joined');

            if (Array.isArray(clients) && clients.length > 0) {
                clients.forEach((userId) => {
                    if (!connections[userId]) {
                        // RTCPeerConnection 생성 시 ICE 서버 설정 추가
                        connections[userId] = new RTCPeerConnection(iceServers);

                        // onicecandidate 수정
                        connections[userId].onicecandidate = (event) => {
                            if (event.candidate) {
                                console.log(socket.id, ' Send candidate to ', userId);
                                socket.emit('signaling', {
                                    type: 'candidate',
                                    candidate: event.candidate,
                                    toId: userId
                                });
                            }
                        };

                        // onaddstream에서 remote stream 처리
                        // connections[userId].onaddstream = (event) => {
                        //     gotRemoteStream(event, userId);
                        // };

                        // ontrack 이벤트에서 원격 스트림 처리
                        connections[userId].ontrack = (event) => {
                            console.log('Received remote stream from', userId);
                            gotRemoteStream(event, userId);
                        };

                        // connections[userId].addStream(localStream);

                        // 로컬 스트림의 트랙을 PeerConnection에 추가
                        localStream.getTracks().forEach((track) => {
                            console.log(`Adding track: ${track.kind}`); // track.kind가 "audio" 또는 "video"로 출력됩니다.
                            connections[userId].addTrack(track, localStream);
                        });
                    }
                });

                // 새로운 유저에게 Offer 보내기
                if (data.count >= 2) {
                    connections[joinedUserId].createOffer(offerOptions).then((description) => {
                        connections[joinedUserId]
                            .setLocalDescription(description)
                            .then(() => {
                                console.log(socket.id, ' Send offer to ', joinedUserId);
                                socket.emit('signaling', {
                                    toId: joinedUserId,
                                    description: connections[joinedUserId].localDescription,
                                    type: 'sdp'
                                });
                            })
                            .catch(handleError);
                    });
                }
            }
        });

        // 유저가 떠났을 때 처리
        socket.on('user-left', (userId) => {
            let video = document.querySelector('[data-socket="' + userId + '"]');
            if (video) {
                video.parentNode.removeChild(video);
            }
        });

        // signaling 이벤트 처리
        socket.on('signaling', (data) => {
            gotMessageFromSignaling(socket, data);
        });
    });
}

function gotMessageFromSignaling(socket, data) {
    const fromId = data.fromId;
    if (fromId !== localUserId) {
        switch (data.type) {
            case 'candidate':
                console.log(socket.id, ' Receive Candidate from ', fromId);
                if (data.candidate) {
                    gotIceCandidate(fromId, data.candidate);
                }
                break;

            case 'sdp':
                if (data.description) {
                    console.log(socket.id, ' Receive SDP from ', fromId);
                    connections[fromId].setRemoteDescription(new RTCSessionDescription(data.description))
                        .then(() => {
                            if (data.description.type === 'offer') {
                                connections[fromId].createAnswer()
                                    .then((description) => {
                                        connections[fromId].setLocalDescription(description).then(() => {
                                            console.log(socket.id, ' Send answer to ', fromId);
                                            socket.emit('signaling', {
                                                type: 'sdp',
                                                toId: fromId,
                                                description: connections[fromId].localDescription
                                            });
                                        });
                                    })
                                    .catch(handleError);
                            }
                        })
                        .catch(handleError);
                }
                break;
        }
    }
}

function getUserMediaSuccess(mediaStream) {
    localStream = mediaStream;
    localVideo.srcObject = mediaStream;

    const audioTracks = mediaStream.getAudioTracks();
    if (audioTracks.length > 0) {
        console.log('Audio track acquired:', audioTracks[0]);
    } else {
        console.warn('No audio tracks found.');
    }
}

function handleError(e) {
    console.error(e);
    alert('Something went wrong');
}

// 로컬 스트림 시작
startLocalStream();