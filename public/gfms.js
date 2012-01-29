$(function() {
	
	var filename = $('#content').data('filename');
	
	var socket = io.connect();
	socket.on('message', function(data) {
		if(filename === data.update)
			$('div.markdown-body').html(data.content);
	});
	
});