/**
* jQuery UI Labs - buttons
* - for experimental use only -
* this file contains the required class to make buttonset for ui.button.
* Copyleft (l) 2009 Jonathan gotti aka malko < jgotti at jgotti dot org >
* Dual licensed under the MIT and GPL licenses.
* http://docs.jquery.com/License
* Depends:
*		ui.core.js
*		ui.classnameoptions.js
*		ui.button.js
*/
(function($){

	$.widget('ui.buttonset',$.extend({},$.ui.classnameoptions,{
		_orientationValue:'',
		_sizeValue:'',
		_initiated:false,
		_init:function(){
			var self=this;
			// read inline options
			if(self._readClassNameOpts){
				var inlineOptions=self._readClassNameOpts({size:'|auto|tiny|small|normal|big|huge',orientation:'|auto|[trbli]'})
				self._mergeOpts(inlineOptions);
			}

			self.element.addClass($.ui.buttonset.classes.base+' ui-widget');

			if( !$.support.style){
				self.element.addClass($.ui.buttonset.classes.blockFix);
			}
			self._setData('size',self.options.size);
			self._setData('orientation',self.options.orientation);
			self._initiated = true;
			self.propagateSettings();

		},
		// propagate settings to child nodes
		propagateSettings:function(){
			var self=this;
			self.element.contents().each(function(){
				var elmt=$(this);
				if( this.nodeType!=1 || ! this.tagName){
					return elmt.remove();
				}
				elmt.button().button('importButtonSetSettings',self);
				if(! elmt.is(':first-child')){
					elmt.css({borderLeftWidth:'0px'});
				}
			})
		},
		_setData:function(key,value){
			var self = this;
			var res = $.widget.prototype._setData.apply(this, arguments);
			switch(key){
				case 'orientation':
					self._orientationValue =  value=='auto'?'l':value;
					if( self._initiated){
						self.propagateSettings();
					}
					break;
				case 'size':
					self._sizeValue = value=='auto'?'normal':value;
					if( self._initiated){
						self.propagateSettings();
					}
					break;
			}
			return res;
		}

	}));

	$.extend($.ui.buttonset,{
		version: "@VERSION",
		defaults:{
			size:'auto',
			orientation:'auto'
		},
		classes:{
			base:'ui-buttonset',
			blockFix: 'ui-button-inlineBlockFix'
		}
	});

	/**
	* Note: the selectbuttonset wont exists forever it's intended to be merged with normal buttonset.
	*/
	$.widget("ui.selectbuttonset",$.extend({},$.ui.classnameoptions,{
		multiple:false,
		buttonset:null,
		_init:function(){
			var self=this;
			// read inline options
			if(self._readClassNameOpts){
				var inlineOptions=self._readClassNameOpts({size:'|auto|tiny|small|normal|big|huge',orientation:'|auto|[trbli]'},$.ui.buttonset.classes.base)
				self._mergeOpts(inlineOptions);
			}

			if( self.element.attr('multiple') ){
				self.multiple = true;
			}
			self.buttonset = $('<div class="'+$.ui.buttonset.classes.base+'"></div>');
			self.element.hide();
			self.element.after(self.buttonset);
			self.refresh();
			self.buttonset.buttonset(self.options);
		},
		refresh:function(){
			var self = this;
			var multiple = self.multiple;
			self.element.children('option').each(function(i){
				var option = $(this);
				var label = option.html();
				var optionIcon = option.attr('class').match(/(?:^|\s)ui-icon-(.+)(?:$|\s)/);
				var optionOptions = {
					buttonMode:'toggle',
					active:option.is(':selected')?true:false,
					size:self._getData('size'),
					orientation:self._getData('orientation'),
					icon:(null !== optionIcon)?optionIcon[0]:''
				};
				var a = $('<a type="button" class="ui-button">'+label+'</a>')
					.appendTo(self.buttonset)
					.button(optionOptions)
					.click(function(e){self._toggle(e,this,option)});
			});
		},
		_toggle:function(event,buttonElmt,option){
			var self = this;
			if(! self.multiple){
				// if no other buttons are activated we can't unselect that option.
				var siblingOptions = self.buttonset.find('.'+$.ui.button.classes.base).not(buttonElmt);
				var canContinue=false;
				siblingOptions.each(function(){
					if($(this).button('option','active')){
						canContinue = true;
						return false;
					}
				});
				if( ! canContinue){
					$(buttonElmt).button('option','active',true);
					return self;
				}
				siblingOptions.button('option','active',false);
			}
			option.attr('selected',$(buttonElmt).button('option','active')?'selected':'');
			self.element.change();
		}
	}));
	$.extend($.ui.selectbuttonset, {
		version: "@VERSION",
		defaults:{
			size:'normal',
			orientation:'auto'
		}
	});
})(jQuery);
