import React, { useEffect, useState, useRef } from 'react';
import './style.css';
import Chat from '../Chat';
import Sidebar from '../Sidebar';
import NewRoom from '../NewRoom';
import chatHttp from '../../services/Http';
import RoomDetails from '../RoomDetails';
import { useChat } from '../../context/ChatContext';
import GeneralSnackbar from '../GeneralSnackbar';
import messageAudio from '../../assets/audio/message.mp3';
import { useUser } from '../../context/UserContext';
import { USER_INITIAL_VALUE } from '../../constants';
import { useHistory } from 'react-router-dom';
import { JoinEventResp, LeaveEventResp, RoomPopulated, User } from '../../types';

export interface RoomProps {
	history: ReturnType<typeof useHistory>;
}

const audio = new Audio(messageAudio);

const Room = ({ history }: RoomProps) => {
	const { userDetails, setUserDetails } = useUser();
	const [ openModal, setOpenModal ] = useState(false);
	const [ openSnackbar, setOpenSnackbar ] = useState(false);
	const snackbarMsg = useRef('');
	const [ rooms, setRooms ] = useState([] as RoomPopulated[]);
	const [ roomCode, setRoomCode ] = useState('');
	const chatSocket = useChat();

	useEffect(
		() => {
			console.log('Initializing Socket Context..');
			chatSocket.init();
			chatHttp
				.getRooms()
				.then(({ data }) => {
					setRooms(data.rooms);
					if (data.rooms[0]) {
						setRoomCode(data.rooms[0].code);
						data.rooms.forEach((room: RoomPopulated) => {
							chatSocket.join({ name: userDetails.username || '', room: room.code });
						});
					}
				})
				.catch(({ response }) => {
					if (response.status === 401) {
						localStorage.clear();
						setUserDetails(USER_INITIAL_VALUE);
						history.push('/login');
					}
				});
		},
		[ history, chatSocket, userDetails.username, setUserDetails ]
	);

	useEffect(
		() => {
			if (chatSocket === null) return;
			const joinSubscription = chatSocket.onJoin().subscribe(({ userDetails, joinedRoom }: JoinEventResp) => {
				setRooms((prevRooms: RoomPopulated[]) => {
					const newRooms = [ ...prevRooms ];
					const userIndex = newRooms.findIndex((room: RoomPopulated) => room.code === joinedRoom);
					if (userIndex >= 0) newRooms[userIndex].users.push(userDetails);
					return newRooms;
				});
			});
			const leaveSubscription = chatSocket.onLeave().subscribe(({ userDetails, leftRoom }: LeaveEventResp) => {
				setRooms((prevRooms: RoomPopulated[]) => {
					const newRooms = [ ...prevRooms ];
					const userIndex = newRooms.findIndex((room: RoomPopulated) => room.code === leftRoom);
					if (userIndex >= 0) {
						newRooms[userIndex].users = newRooms[userIndex].users.filter(
							(user: User) => user.username !== userDetails.username
						);
					}
					return newRooms;
				});
			});
			return () => {
				joinSubscription.unsubscribe();
				leaveSubscription.unsubscribe();
			};
		},
		[ chatSocket ]
	);

	useEffect(
		() => {
			if (chatSocket === null) return;
			const deleteSubscription = chatSocket.onRoomDelete().subscribe((deletedRoom: string) => {
				snackbarMsg.current = `Room ${deletedRoom} has been deleted.`;
				setOpenSnackbar(true);
				if (roomCode === deletedRoom) setRoomCode((roomCode) => '');
				setRooms((prevRooms: RoomPopulated[]) => prevRooms.filter((room: RoomPopulated) => room.code !== deletedRoom));
			});
			const messageSubscription = chatSocket.onMessage().subscribe(({ newMsg, updatedRoom }) => {
				console.log(newMsg);
				console.log(updatedRoom);
				setRooms((prevRooms: RoomPopulated[]) => {
					const newRooms = [ ...prevRooms ];
					const userIndex = newRooms.findIndex((room: RoomPopulated) => room.code === newMsg.roomCode);
					if (userIndex >= 0) {
						if (updatedRoom) newRooms[userIndex] = updatedRoom;
						if (newMsg.roomCode !== roomCode) {
							newRooms[userIndex].unread = newRooms[userIndex].unread ? ++newRooms[userIndex].unread! : 1;
							audio.play();
						}
					}
					return newRooms;
				});
			});
			return () => {
				deleteSubscription.unsubscribe();
				messageSubscription.unsubscribe();
			};
		},
		[ chatSocket, roomCode ]
	);

	const getCurrentRoom = () => {
		return rooms.find((room: RoomPopulated) => room.code === roomCode);
	};

	const handleRoomClick = (code: string) => {
		setRoomCode(code);
		setRooms((prevRooms: RoomPopulated[]) => {
			const newRooms = [ ...prevRooms ];
			const userIndex = newRooms.findIndex((room: RoomPopulated) => room.code === code);
			newRooms[userIndex].unread = 0;
			return newRooms;
		});
	};

	const handleRoomLeave = (code: string) => {
		setRoomCode('');
		setRooms(rooms.filter((room: RoomPopulated) => room.code !== code));
	};

	const handleModalClose = (room: RoomPopulated | null) => {
		if (room) {
			setRooms([ ...rooms, room ]);
			setRoomCode(room.code);
		}
		setOpenModal(false);
	};

	return (
		<div className="room">
			<Sidebar onNewRoom={() => setOpenModal(true)} rooms={rooms} history={history} onRoomClick={handleRoomClick} />
			{roomCode ? (
				<React.Fragment>
					<Chat roomCode={roomCode} />
					<RoomDetails roomDetails={getCurrentRoom()!} onRoomLeave={handleRoomLeave} />
				</React.Fragment>
			) : (
				<div className="chat chat--no-room">
					<div className="chat__header" />
					<div className="chat__body">
						<p className="header__text">
							{rooms.length > 0 ? 'Click a room to start chatting!' : 'Create or Join a room to start a conversation!'}
						</p>
					</div>
				</div>
			)}

			<NewRoom open={openModal} onClose={handleModalClose} />
			<GeneralSnackbar message={snackbarMsg.current} open={openSnackbar} onClose={() => setOpenSnackbar(false)} />
		</div>
	);
};

export default Room;
