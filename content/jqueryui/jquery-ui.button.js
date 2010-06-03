/**
* jQuery UI Labs - buttons
* - for experimental use only -
* this is the core of all ui-button plugins
* Copyleft (l) 2009 Jonathan gotti aka malko < jgotti at jgotti dot org >
* Dual licensed under the MIT and GPL licenses.
* http://docs.jquery.com/License
* Depends:
*		ui.core.js
*		ui.classnameoptions.js
*/
(function($){

	// base ui-button plugin
	$.widget("ui.button",$.extend({},$.ui.classnameoptions,{
		_originalClass: '',
		_originalElement:null,

		_elmt_icon:null,
		_elmt_iconContainer:null,
		_elmt_label:null,
		_iconIsImage:false,
		_iconBeforeLabel:true,
		_buttonset:null,

		_orientationValue:'',
		_sizeValue:'',
		_cbToggle:null,

		_init:function(){
			var self = this;
			

			//-- should think about aborting or not init when ui-button-none, ui-buttonset are used.
			if( this.element.attr('class').match(/(?:^|\s+)ui-button(set|-none(\s|$))/) ){
				return $.widget.prototype.destroy.apply(this, arguments);
			}
			self._originalClass = self.element.attr('class');
			// read inline options from class attribute (that can't be null!!!)
			if( $.ui.classnameoptions){
				var inlineOptions=self._readClassNameOpts({buttonMode:'|toggle',active:'|active',size:'|auto|tiny|small|normal|big|huge',orientation:'|auto|[trbli]',icon:'|[a-zA-Z0-9_-]+'})
				if( inlineOptions.icon && ! inlineOptions.icon.match(/\.(gif|png|jpe?g)$/i)){
					inlineOptions.icon = 'ui-icon-'+inlineOptions.icon;
				}
				self._mergeOpts(inlineOptions);
			}

			self.element.addClass($.ui.button.classes.base+' ui-widget ');
			if(! self.element.attr('tabindex')){
				self.element.attr('tabindex',0);
			}
			// preapre wrapers elements
			self._wrapLabel();
			self._wrapIcon();

			// detect some toggle markup options
			if( self.element.hasClass('toggle') || self.element.hasClass($.ui.button.classes.modeToggle)){
				self.options.buttonMode = 'toggle';
			}
			if( self.element.hasClass('active') || self.element.hasClass($.ui.button.classes.stateActive)){
				self.options.active = true;
			}

			// apply some settings
			if(self._applyOpts){
				self._applyOpts(['size','orientation','icon','overrideDefaultState'])
					._applyOpts(['buttonMode','active','label'],true);
			}else{
				self._setData('size',self.options.size);
				self._setData('orientation',self.options.orientation);
				self._setData('icon',self.options.icon);
				self._setData('overrideDefaultState',self.options.overrideDefaultState);
				if( self.options.buttonMode ){
					self._setData('buttonMode',self.options.buttonMode);
					if( self.options.active ){
						self._setData('active',self.options.active);
					}
				}
				if( self.label !== null){
					self._setData('label',self.options.label);
				}
			}

			if( null!==self.options.disabled ){
				self._setData('disabled',self.options.disabled);
			}else if( self.element.attr('disabled') ){
				self._setData('disabled',true);
			}

			if(! $.support.style){
				this.element.addClass($.ui.button.classes.blockFix);
			}
			// auto initialisation of button set on last buttonset element
			if( self.options.checkButtonset){
				var buttonset = self.element.parent('[class*=ui-buttonset]'); //@todo replaced by $.ui.buttonset.base when will exist
				if( buttonset.length > 0){
						self._buttonset = buttonset;
						if( this.element.is(':last-child')){
							buttonset.buttonset();
						}
				}
			}
			if(! self.element.attr('class').match(/ui-corner-[a-z]+/) ){
				self.element.addClass('ui-corner-all');
			}
			self._bindCommonEvents();
			return this;
		},

		//--- events ---//
		_bindCommonEvents: function(){
			var self = this;
			var _mouseenter= function(){
				var elmt = $(this);
				if(! elmt.button('option','disabled') ){
					elmt.addClass($.ui.button.classes.stateHover);
				}
			};
			var _mouseleave= function(){
				$(this).removeClass($.ui.button.classes.stateHover+' '+$.ui.button.classes.stateDown);
			};
			var _pressed= function(e){
				var elmt = $(this);
				if( elmt.button('option','disabled') ){
					return false;
				}
				if( e.type==='mousedown' || (e.type==='keydown' && (e.keyCode===$.ui.keyCode.ENTER || e.keyCode===$.ui.keyCode.SPACE || e.keyCode===$.ui.keyCode.NUMPAD_ENTER)) ){
					elmt.addClass($.ui.button.classes.stateDown);
					if( e.type==='keydown'){
						if(! ($.browser.opera && e.keyCode===$.ui.keyCode.ENTER)){ // i Hate this dirty browser detection but not doing this goes to weird behaviour on opera.
							self.element.click();
						}
						return false; //avoid keypress event when firing click() or we'll end up with doubling the click event on buttons under ie browsers
					}
				}
			};
			var _released=function(event){
				var elmt = $(this);
				// release event should not do anything if actual element wasn't pressed before (we probably have dragged the mouse from another element.)
				if(! elmt.hasClass($.ui.button.classes.stateDown) )
					return false;
				$(this).removeClass($.ui.button.classes.stateDown);
			};
			var _focus=function(event){
				var elmt = $(this);
				if( elmt.button('option','disabled') ){
					return false;
				}
				elmt.addClass($.ui.button.classes.stateFocus);
			};
			var _blur= function(){
				$(this).removeClass($.ui.button.classes.stateFocus+' '+$.ui.button.classes.stateDown);
			};
			var events = {
				mouseenter:_mouseenter,
				mouseleave:_mouseleave,
				mousedown:_pressed,
				keydown:_pressed,
				mouseup:_released,
				keyup:_released,
				focus:_focus,
				blur:_blur
			};
			var eventName = '';
			for( eventName in events){
				self.element.bind(eventName+'.uibutton',events[eventName]);
			}
		},
		//--- markup ---//
		_setIcon:function(){
			var ico = this._getData('icon');
			this._iconIsImage =( ico.match(/\.(jpe?g|png|gif|ico)$/i) )?true:false;
			if(null !== this._elmt_icon){
				this._elmt_icon.remove();
			}
			if( '' === ico || null === ico){
				this._elmt_icon = null;
				this._elmt_iconContainer.hide();
				ico='ui-icon-none';
			}
			if( this._iconIsImage){
				this._elmt_icon=$('<img src="'+escape(ico)+'"  />');
			}else{
				this._elmt_icon=$('<span class="'+(ico.match(/^ui-icon-/)?'ui-icon '+ico:ico)+'"></span>');
			}
			if(this._elmt_icon.length && ! $.support.style){
				this._elmt_icon.css({margin:0});
			}
			this._elmt_iconContainer.append(this._elmt_icon);
			this._elmt_iconContainer.show();
		},
		_wrapIcon:function(){
			if( null!==this._elmt_iconContainer){
				return;
			}
			this._elmt_iconContainer=$('<span class="'+$.ui.button.classes.wrapperIcon+'"></span>');
			this.element.append(this._elmt_iconContainer);
		},
		_wrapLabel:function(){
			if( null!==this._elmt_label ){
				return;
			}
			var _elmt_label=$('<span class="'+$.ui.button.classes.wrapperLabel+'"></span>');
			if( this.element.html().replace(/\s/,'').length > 0){
				this.element.wrapInner(_elmt_label);
			}else{
				this.element.append(_elmt_label.append('&nbsp').addClass($.ui.button.classes.wrapperLabelEmpty));
			}
			this._elmt_label = this.element.find('>.'+$.ui.button.classes.wrapperLabel).disableSelection();
		},
		_checkElmtPos: function(){
			var actual = this.element.find('span:first').is('.'+$.ui.button.classes.wrapperIcon)?true:false;
			if( actual==this._iconBeforeLabel)
				return this;
			if( this._iconBeforeLabel){
				this.element.prepend(this._elmt_iconContainer);
			}else{
				this.element.append(this._elmt_iconContainer);
			}
			return this;
		},
		//--- applying options settings ---//
		_setData:function(key,value){
			var self = this;
			switch(key){
				case 'icon':
					var res = $.widget.prototype._setData.apply(self, arguments);
					this._setIcon();
					return res;
					break;
				case 'label': // @todo should think of a way to revert to original label if changed
					if( null!==value){
						if( ''===value){
							self._elmt_label.addClass($.ui.button.classes.wrapperLabelEmpty).html('&nbsp;');
						}else{
							self._elmt_label.removeClass($.ui.button.classes.wrapperLabelEmpty)
								.empty().append(value);
						}
					}
					break;
				case 'orientation':
					if(! value){
						value = 'auto';
					}
					var applyValue = (value==='i'?'auto':value);
					if( applyValue==='auto' && self._buttonset ){
						applyValue = self._buttonset.buttonset('option','orientation');
					}
					self._orientationValue = (applyValue=='auto'||applyValue=='i')?'l':applyValue;
					if( value==='i' || applyValue==='i'){
						self._setData('label','');
					}
					self._rmExpClass($.ui.button.classes.base+'-orientation-*',$.ui.button.classes.base+'-orientation-'+self._orientationValue);
					self._iconBeforeLabel=( self._orientationValue=='b' || self._orientationValue=='r')?false:true;
					self._checkElmtPos();
					break;
				case 'size':
					self._sizeValue = value=='auto'?'normal':value;
					self._rmExpClass($.ui.button.classes.base+'-size-*',$.ui.button.classes.base+'-size-'+self._sizeValue);
					break;
				case 'disabled':
					self.element.attr('disabled',value?true:false);
					break;
				case 'buttonMode':
					switch(value){
						case 'toggle':
							if(! self._cbToggle){
								self._cbToggle = function(event){return self.toggle(event);};
							}
							self.element.addClass($.ui.button.classes.modeToggle);
							self.element.bind('click.uibutton',self._cbToggle);
							break;
						default:
							if(! self._cbToggle){
								self.element.unbind('click.uibutton',self._cbToggle);
								self.element.removeClass($.ui.button.classes.modeToggle);
							}
					}
					break;
				case 'active':
					if( self._getData('buttonMode') !== 'toggle' || self._getData('disabled') )
						return false;
					value = value?true:false;
					self.element.toggleClass($.ui.button.classes.stateActive+' active',value);
					self._trigger('setactive',0,{active:value});
					break;
				case 'overrideDefaultState':
					if( value===false){
						value = $.ui.button.classes.stateDefault;
					}
					self.element.removeClass(this._getData('overrideDefaultState')).addClass(value);
					break;
			}
			return $.widget.prototype._setData.apply(this, arguments);
		},
		importButtonSetSettings:function(buttonSet){
			var self=this;
			self._buttonset = buttonSet.element;
			var buttonSetSize = buttonSet._getData('size');
			var buttonSetOrientation = buttonSet._getData('orientation');
			if( self._getData('size')==='auto' && buttonSetSize !== 'auto'){
				self._setData('size',buttonSetSize);
				self.options.size='auto';
			}
			var orientationOption = self._getData('orientation');
			if( orientationOption==='auto' || orientationOption==='i' && buttonSetOrientation !== 'auto'){
				self._setData('orientation',buttonSetOrientation);
				self.options.orientation=orientationOption;
			}
			var isOnlyChild = self.element.is(':only-child');
			if( self.element.is(':first-child') && ! isOnlyChild ){
				self._rmExpClass('ui-corner-*','ui-corner-left');
			}else if(self.element.is(':last-child') && ! isOnlyChild ){
				self._rmExpClass('ui-corner-*','ui-corner-right');
			}else{
				self._rmExpClass('ui-corner-*','ui-corner-'+(isOnlyChild?'all':'none'));
			}

		},
		//--- public methods ---//
		destroy: function(){
			if( this._originalElement ){
				this.element.replaceWith(this._originalElement);
			}else{
				this.element.unbind('.uibutton').attr('class',this._originalClass);
				this._elmt_iconContainer.remove();
				this._elmt_label.contents().insertAfter(this._elmt_label)
				this._elmt_label.remove();
			}
			return $.widget.prototype.destroy.apply(this, arguments);
		},
		toggle: function(event){
			this._setData('active',this._getData('active')?false:true);
			return this;
		},
		/**
		* remove matching class names from element and eventually add new class on given element (default to widget.element)
		*/
		_rmExpClass:function(exp,add,elmt){
			elmt=(!elmt)?this.element:$(elmt);
			exp = new RegExp('(?:^|\\s)'+exp.replace(/\*/g,'[a-zA-Z_0-9-]*')+'(?=$|\\s)','g');
			elmt.attr('class',elmt.attr('class').replace(exp,''));
			if( undefined!==add ){
				elmt.addClass(add);
			}
			return this;
		}

	}));

	$.extend($.ui.button, {
		version: "@VERSION",
		defaults:{
			size:'auto',
			orientation:'auto',
			icon:'',
			label:null,
			buttonMode:null,
			disabled:null,
			active:false, // set toggle button to active state
			checkButtonset:false, // check for .ui-buttonset parent and trigger parent buttonset rendering if found
			overrideDefaultState:false // any string to used in place of classes.stateDefault (empty string may be used for no state class at all)
		},
		classes:{
			base:              'ui-button',
			wrapperLabel:      'ui-button-label',
			wrapperLabelEmpty: 'ui-button-label-empty',
			wrapperIcon:       'ui-button-icon',
			wrapperIconEmpty:  'ui-icon-none',
			modeToggle:        'ui-button-toggle',
			modeSplit:         'ui-button-split',
			modeMenu:          'ui-button-menu',
			modeSplit:         'ui-button-split',
			stateDefault:      'ui-state-default',
			stateActive:       'ui-state-active',
			stateHover:        'ui-state-hover',
			stateDown:         'ui-state-highlight', // must be different than active!
			stateFocus:        'ui-state-focus',
			blockFix:          'ui-button-inlineBlockFix'
		}
	});//*/
})(jQuery);