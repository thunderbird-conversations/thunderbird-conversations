$(document).ready(function($) {
    
    $('ul.inputs li.expand').click(function() {
        $(this).parent().addClass('noPad');
        $(this).addClass('selected');
        $(this).siblings().addClass('invisible');
        setTimeout(function() {
            $('.replyHeader, .replyFooter').slideDown();
        }, 500);
        
        var textareas = $(this).find('textarea');
        textareas.addClass('ease selected');
        setTimeout(function() {
            textareas.removeClass('ease');
        }, 900);
    });
    
    $('a.discard').click(function() {
        $('.replyHeader, .replyFooter').slideUp();
        setTimeout(function() {
            $('ul.inputs').removeClass('noPad');
            $('ul.inputs li').removeClass('selected');
            $('ul.inputs li').removeClass('invisible');
            
            
            var textareas = $('ul.inputs li textarea.selected');
            textareas.addClass('ease');
            textareas.removeClass('selected');
            textareas.removeAttr('style');
            setTimeout(function() {
                textareas.removeClass('ease');
            }, 500);
            
        }, 500);
    });

});
